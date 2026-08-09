// Docker 镜像更新检测：对比远程主机上容器的镜像 digest 与 registry 最新 digest
const { Client } = require("ssh2");
const https = require("https");

// ---------- SSH：读取远程容器使用的镜像 RepoDigest ----------
function sshExec(host, port, user, pass, command, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let out = "";
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("SSH 连接超时"));
    }, timeout);
    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            return reject(err);
          }
          stream
            .on("close", () => {
              clearTimeout(timer);
              conn.end();
              resolve(out.trim());
            })
            .on("data", (d) => (out += d.toString()))
            .stderr.on("data", () => {});
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({ host, port, username: user, password: pass, readyTimeout: 8000 });
  });
}

// 读取容器当前镜像的 RepoDigest（如 calciumion/new-api@sha256:be4b...）
async function getContainerDigest(container, cfg) {
  const script = `CID=$(docker inspect -f '{{.Image}}' ${container} 2>/dev/null) && docker inspect -f '{{range .RepoDigests}}{{println .}}{{end}}' $CID 2>/dev/null`;
  const out = await sshExec(cfg.host, cfg.port || 22, cfg.user, cfg.pass, script);
  const m = out.match(/sha256:[0-9a-f]{64}/);
  if (!m) {
    // 空输出 = 容器不存在
    const probe = await sshExec(
      cfg.host,
      cfg.port || 22,
      cfg.user,
      cfg.pass,
      `docker inspect -f '{{.Name}}' ${container} 2>/dev/null || echo __NOTFOUND__`
    );
    if (probe.includes("__NOTFOUND__")) return { ok: false, reason: "notfound" };
    return { ok: false, reason: "nodigest" };
  }
  return { ok: true, digest: m[0] };
}

// ---------- Registry：查询镜像最新 digest ----------
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      })
      .on("error", reject);
  });
}

// 解析镜像名 -> { repo, tag }（默认 latest）
function parseImage(image) {
  let repo = image.trim();
  let tag = "latest";
  // 去掉 registry 前缀中的端口与斜杠之间的部分，但保留 repo 路径
  if (repo.includes("@")) repo = repo.split("@")[0];
  const slashIdx = repo.lastIndexOf("/");
  const colonIdx = repo.lastIndexOf(":");
  if (colonIdx > slashIdx) {
    tag = repo.slice(colonIdx + 1);
    repo = repo.slice(0, colonIdx);
  }
  return { repo, tag };
}

// 查 registry 最新 manifest digest（多架构取 manifest list 的 digest）
async function getRegistryDigest(image) {
  let { repo, tag } = parseImage(image);
  // Docker Hub 官方镜像在 registry 中路径为 library/<repo>
  if (!repo.includes("/")) repo = `library/${repo}`;
  const registry = "registry-1.docker.io";
  const authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${encodeURIComponent(repo)}:pull`;
  const auth = await httpsGet(authUrl);
  if (auth.status !== 200) return { ok: false, reason: "auth" };
  const token = JSON.parse(auth.body).token;
  const manifestUrl = `https://${registry}/v2/${repo}/manifests/${encodeURIComponent(tag)}`;
  const res = await httpsGet(manifestUrl, {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
  });
  if (res.status !== 200) return { ok: false, reason: `http_${res.status}` };
  const digest = res.headers["docker-content-digest"];
  if (!digest) return { ok: false, reason: "nodigest" };
  return { ok: true, digest };
}

// ---------- 组合检测 ----------
async function checkService(service, cfg) {
  if (!cfg || !cfg.host || !cfg.user) return { status: "noconfig", checkedAt: Date.now() };
  try {
    const local = await getContainerDigest(service.docker_container, cfg);
    if (!local.ok) return { status: local.reason, checkedAt: Date.now() };
    const remote = await getRegistryDigest(service.docker_image);
    if (!remote.ok) return { status: "registry_error", checkedAt: Date.now() };
    return {
      status: local.digest === remote.digest ? "latest" : "update",
      localDigest: local.digest.slice(0, 12),
      remoteDigest: remote.digest.slice(0, 12),
      checkedAt: Date.now(),
    };
  } catch (e) {
    return { status: "ssh_error", error: e.message, checkedAt: Date.now() };
  }
}

module.exports = { checkService, sshExec, parseImage, getRegistryDigest };
