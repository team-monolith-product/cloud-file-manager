import { getCodapActivity, updateCodapActivity } from "../api/codapActivities"
import { createBlobAndUrlFromFile } from "../api/directUploads"
import {
  getProfilesCodapActivity,
  updateProfilesCodapActivity,
} from "../api/profilesCodapActivities"
import { CFMBaseProviderOptions } from "../app-options"
import { CloudFileManagerClient } from "../client"

import {
  CloudContent,
  cloudContentFactory,
  CloudMetadata,
  ProviderInterface,
  ProviderListCallback,
  ProviderLoadCallback,
  ProviderOpenCallback,
  ProviderSaveCallback,
} from "./provider-interface"

class ClassRailsProvider extends ProviderInterface {
  static Name = "classRails"
  client: CloudFileManagerClient
  options: CFMBaseProviderOptions

  content: any
  files: Record<
    string,
    {
      content: CloudContent
      metadata: CloudMetadata
    }
  >
  private _projectId: string | undefined = undefined

  constructor(
    options: CFMBaseProviderOptions | undefined,
    client: CloudFileManagerClient
  ) {
    super({
      name: ClassRailsProvider.Name,
      displayName: options?.displayName || "서버",
      urlDisplayName: options?.urlDisplayName,
      capabilities: {
        save: true,
        resave: true,
        "export": false,
        load: true,
        list: false,
        remove: false,
        rename: false,
        close: false,
      },
    })
    this.options = options
    this.client = client
    this.files = {}
  }
  static Available() {
    return true
  }

  /**
   * 프로젝트 정보를 서버에서 요청하여 가져옵니다.
   * 이때, mode URL 파라미터에 따라 다른 API 엔드포인트를 사용합니다.
   */
  private async _getProject(projectId: string): Promise<{
    data: unknown
    updatedAt: string | null
  }> {
    const urlParams = new URLSearchParams(window.location.search)
    const isEditMode = urlParams.get("mode") === "edit"
    if (isEditMode) {
      const codapActivity = await getCodapActivity({ id: projectId })
      if (!codapActivity.url) {
        return { data: null, updatedAt: null }
      }

      const response = await fetch(codapActivity.url)
      const projectData = await response.json()
      return { data: projectData, updatedAt: null }
    } else {
      const profilesCodapActivity = await getProfilesCodapActivity({
        id: projectId,
        includeProfilesActivity:
          "profilesActivity.classroomsActivity.activity.activitiable",
      })

      // profilesCodapActivity.url이 없다면 원본 activity의 url에서 데이터를 가져옵니다.
      const projectUrl =
        profilesCodapActivity.url ??
        profilesCodapActivity.profilesActivity.classroomsActivity.activity
          .activitiable.url
      if (!projectUrl) {
        return {
          data: null,
          updatedAt: profilesCodapActivity.projectDataUpdatedAt,
        }
      }

      const response = await fetch(projectUrl)
      const projectData = await response.json()
      return {
        data: projectData,
        updatedAt: profilesCodapActivity.projectDataUpdatedAt,
      }
    }
  }

  /**
   * 프로젝트를 업데이트합니다.
   * 이때, mode URL 파라미터에 따라 다른 API 엔드포인트를 사용합니다.
   */
  private async _updateProject(projectId: string, blobId: string) {
    const urlParams = new URLSearchParams(window.location.search)
    const isEditMode = urlParams.get("mode") === "edit"
    if (isEditMode) {
      return await updateCodapActivity({ id: projectId }, blobId)
    } else {
      return await updateProfilesCodapActivity({ id: projectId }, blobId)
    }
  }

  /**
   * 원본 활동의 이름을 가져옵니다.
   */
  private async _getActivityName(projectId: string) {
    const urlParams = new URLSearchParams(window.location.search)
    const isEditMode = urlParams.get("mode") === "edit"
    if (isEditMode) {
      const codapActivity = await getCodapActivity({
        id: projectId,
        includeActivity: "activity",
      })
      return codapActivity.activity.name
    } else {
      const profilesCodapActivity = await getProfilesCodapActivity({
        id: projectId,
        includeProfilesActivity: "profilesActivity.classroomsActivity.activity",
      })
      return profilesCodapActivity.profilesActivity.classroomsActivity.activity
        .name
    }
  }

  /**
   * content 값을 저장할 때 호출되는 함수입니다.
   */
  async save(
    content: any,
    metadata: CloudMetadata,
    callback?: ProviderSaveCallback
  ) {
    if (!this._projectId) {
      return callback?.("잘못된 접근입니다.")
    }
    try {
      const fileContent = content.getContentAsJSON?.() || content
      const fileBlob = new Blob([fileContent], { type: "application/json" })
      const file = new File([fileBlob], `${metadata.name}.codap`, {
        type: "application/json",
      })
      const { blob } = await createBlobAndUrlFromFile(file)
      await this._updateProject(this._projectId, blob.signed_id)
      return callback?.(null)
    } catch (e) {
      return callback?.(`파일을 저장 할 수 없습니다. ${e.message}`)
    }
  }

  /**
   * 파일을 불러올때 호출되는 함수입니다.
   */
  async load(metadata: CloudMetadata, callback: ProviderLoadCallback) {
    if (!this._projectId) {
      return callback?.("잘못된 접근입니다.")
    }
    try {
      let activityName = ""
      try {
        activityName = await this._getActivityName(this._projectId)
      } catch {
        activityName = "제목없음"
      }

      const project = await this._getProject(this._projectId)
      if (project.data === null) {
        // projectData가 null이라면, content 값으로 null을 반환합니다.
        metadata.rename(activityName)
        return callback(null, null)
      }

      const content = cloudContentFactory.createEnvelopedCloudContent(
        project.data
      )
      metadata.rename((project.data as any).name ?? activityName)
      metadata.providerData = {
        projectDataUpdatedAt: project.updatedAt,
      }
      return callback(null, content)
    } catch (e) {
      console.error(e)
      return callback(`파일을 불러올 수 없습니다. ${e.message}`)
    }
  }

  list(_: CloudMetadata, callback: ProviderListCallback) {
    // 서버의 파일 목록을 가져오는 기능은 제공하지 않으므로, 빈 배열을 반환합니다.
    return callback(null, [])
  }

  canOpenSaved() {
    return true
  }

  /**
   * 저장된 프로젝트를 열때 호출되는 함수입니다.
   * 대표적인 use-case는 `#file=classRails:project_id` 형태의 URL을 통해 저장된 프로젝트를 열 때 사용됩니다.
   * 이때, `openSavedParams`는 project_id가 됩니다.
   */
  openSaved(openSavedParams: string, callback: ProviderOpenCallback) {
    this._projectId = openSavedParams
    const metadata = new CloudMetadata({
      type: CloudMetadata.File,
      parent: null,
      provider: this,
    })
    return this.load(metadata, (err: string | null, content: any) =>
      callback(err, content, metadata)
    )
  }

  getOpenSavedParams(_: CloudMetadata) {
    return this._projectId
  }
}

export default ClassRailsProvider
