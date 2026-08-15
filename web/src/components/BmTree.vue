<script lang="ts">
// 递归书签树（文件夹可折叠，渲染函数组件；样式见 styles.css 的 .fav-panel .bm-*）
import { defineComponent, h, PropType } from "vue";

export interface BmNode {
  type: "folder" | "bookmark";
  name: string;
  url?: string;
  id?: number;
  path?: string[];
  children?: BmNode[];
  open?: boolean;
}

const BmTree = defineComponent({
  name: "BmTree",
  props: {
    nodes: { type: Array as PropType<BmNode[]>, required: true },
    status: { type: Object as PropType<Record<string, { online: boolean; ms: number }>>, default: () => ({}) },
  },
  emits: ["open", "expand", "ctx"],
  setup(props, { emit }) {
    return () =>
      h("div", { class: "bm-tree" }, (props.nodes || []).map((n) => {
        if (n.type === "folder") {
          return h("div", { class: "bm-folder" }, [
            h("button", {
              class: "bm-folder-btn",
              onClick: () => {
                n.open = !n.open;
                if (n.open) {
                  const urls = (n.children || []).filter((c) => c.type === "bookmark").map((c) => c.url);
                  if (urls.length) emit("expand", urls);
                }
              },
              onContextmenu: (e: MouseEvent) => emit("ctx", e, n),
            }, [
              h("span", { class: "bm-caret" }, n.open ? "▾" : "▸"),
              h("span", { class: "bm-folder-name" }, `📁 ${n.name}`),
            ]),
            n.open && n.children?.length
              ? h(BmTree, {
                  nodes: n.children,
                  status: props.status,
                  onOpen: (u: string) => emit("open", u),
                  onExpand: (urls: string[]) => emit("expand", urls),
                  onCtx: (e: MouseEvent, bm: BmNode) => emit("ctx", e, bm),
                })
              : null,
          ]);
        }
        const st = props.status?.[n.url];
        let dot = "unknown";
        let dotTitle = "状态未知";
        if (st) {
          if (!st.online) { dot = "offline"; dotTitle = "离线"; }
          else if (st.ms > 500) { dot = "slow"; dotTitle = `延迟高 ${st.ms}ms`; }
          else { dot = "online"; dotTitle = `在线 ${st.ms}ms`; }
        }
        return h("div", { class: "fav-item", title: `${n.url}（${dotTitle}）`, onClick: () => emit("open", n.url), onContextmenu: (e: MouseEvent) => emit("ctx", e, n) }, [
          h("span", { class: `fav-dot ${dot}`, title: dotTitle }),
          h("span", { class: "fav-name" }, n.name),
        ]);
      }));
  },
});

export default BmTree;
</script>
