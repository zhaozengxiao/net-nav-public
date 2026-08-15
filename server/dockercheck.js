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

// 容器名合法字符（Docker 命名规范）：字母数字开头，可含 . _ -
const VALID_CONTAINER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
// shell 单引号转义：容器名拼进远端命令前必须转义，防命令注入
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// 读取容器当前镜像的 RepoDigest（如 calciumion/new-api@sha256:be4b...）
async function getContainerDigest(container, cfg) {
  if (typeof container !== "string" || !VALID_CONTAINER.test(container)) {
    return { ok: false, reason: "badname" };
  }
  const script = `CID=$(docker inspect -f '{{.Image}}' ${shq(container)} 2>/dev/null) && docker inspect -f '{{range .RepoDigests}}{{println .}}{{end}}' $CID 2>/dev/null`;
  const out = await sshExec(cfg.host, cfg.port || 22, cfg.user, cfg.pass, script);
  const m = out.match(/sha256:[0-9a-f]{64}/);
  if (!m) {
    // 空输出 = 容器不存在
    const probe = await sshExec(
      cfg.host,
      cfg.port || 22,
      cfg.user,
      cfg.pass,
      `docker inspect -f '{{.Name}}' ${shq(container)} 2>/dev/null || echo __NOTFOUND__`
    );
    if (probe.includes("__NOTFOUND__")) return { ok: false, reason: "notfound" };
    return { ok: false, reason: "nodigest" };
  }
  return { ok: true, digest: m[0] };
}

// ---------- Registry：查询镜像最新 digest ----------
// 10s 超时：registry 挂起时必须返回，否则 docker 检测队列 running 数会被卡死
const HTTPS_TIMEOUT = 10000;
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https
      .get(url, { headers, timeout: HTTPS_TIMEOUT }, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
    req.on("timeout", () => req.destroy(new Error(`registry 请求超时（${HTTPS_TIMEOUT}ms）`)));
    req.on("error", reject);
  });
}

// 解析镜像名 -> { registry, repo, tag }（registry 默认 Docker Hub）
// 规则：第一个 "/" 前的段含 "." 或 ":" 时视为 registry（如 ghcr.io / mcr.microsoft.com / localhost:5000）
function parseImage(image) {
  let name = image.trim();
  let tag = "latest";
  if (name.includes("@")) name = name.split("@")[0];
  const slashIdx = name.lastIndexOf("/");
  const colonIdx = name.lastIndexOf(":");
  if (colonIdx > slashIdx) {
    tag = name.slice(colonIdx + 1);
    name = name.slice(0, colonIdx);
  }
  const firstSlash = name.indexOf("/");
  let registry = null;
  let repo = name;
  if (firstSlash > -1) {
    const head = name.slice(0, firstSlash);
    if (head.includes(".") || head.includes(":")) {
      registry = head;
      repo = name.slice(firstSlash + 1);
    }
  }
  if (!registry) {
    registry = "registry-1.docker.io";
    // Docker Hub 官方镜像在 registry 中路径为 library/<repo>
    if (!repo.includes("/")) repo = `library/${repo}`;
  }
  return { registry, repo, tag };
}

// 解析 WWW-Authenticate 挑战头（Bearer realm/service/scope）-> 取 token
async function fetchToken(challenge, repo) {
  const m = challenge.match(/realm="([^"]+)"/i);
  if (!m) return { ok: false, reason: "no_realm" };
  const realm = m[1];
  const service = (challenge.match(/service="([^"]+)"/i) || [])[1];
  const scope = (challenge.match(/scope="([^"]+)"/i) || [])[1] || `repository:${repo}:pull`;
  const params = new URLSearchParams({ scope });
  if (service) params.set("service", service);
  const auth = await httpsGet(`${realm}?${params.toString()}`);
  if (auth.status !== 200) return { ok: false, reason: `auth_${auth.status}` };
  const token = JSON.parse(auth.body).token;
  if (!token) return { ok: false, reason: "no_token" };
  return { ok: true, token };
}

// 查任意 registry 最新 manifest digest（OCI Distribution 标准流程）
// 匿名请求 -> 401 时解析 WWW-Authenticate 取 token -> 带 token 重试
async function getRegistryDigest(image) {
  let { registry, repo, tag } = parseImage(image);
  const manifestUrl = `https://${registry}/v2/${repo}/manifests/${encodeURIComponent(tag)}`;
  const headers = {
    Accept:
      "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json",
  };
  let res = await httpsGet(manifestUrl, headers);
  if (res.status === 401) {
    const challenge = res.headers["www-authenticate"] || "";
    const tok = await fetchToken(challenge, repo);
    if (!tok.ok) return { ok: false, reason: tok.reason };
    res = await httpsGet(manifestUrl, { ...headers, Authorization: `Bearer ${tok.token}` });
  }
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
