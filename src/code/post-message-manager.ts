import { PostMessageManagerImpl } from "@team-monolith/post-message-manager"
import { OpenSaveCallback } from "./client"

const postMessageManager = new PostMessageManagerImpl()

export function registerSavePostMessage(
  save: (callback: OpenSaveCallback) => void
) {
  postMessageManager.register({
    messageType: "save",
    callback: async () => {
      await new Promise((resolve) => {
        save(resolve)
      })
      return true
    },
  })
}
export function registerReloadPostMessage(
  reload: () => Promise<string | null>
) {
  postMessageManager.register({
    messageType: "reload",
    callback: async () => {
      return await reload()
    },
  })
}

export function registerLoadProjectPostMessage(
  loadProject: (projectId: string) => Promise<string | null>
) {
  postMessageManager.register({
    messageType: "loadProject",
    callback: async (projectId: string) => {
      return await loadProject(projectId)
    },
  })
}

export function postiframeLoadedMessageToParent() {
  if (window === window.parent) return
  const iframeKey = new URLSearchParams(window.location.search).get(
    "iframe_key"
  )
  if (!iframeKey) return
  postMessageManager.notify({
    messageType: `iframeLoaded-${iframeKey}`,
    payload: null,
    target: window.parent,
    targetOrigin: "*",
  })
}
