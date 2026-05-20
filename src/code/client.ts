// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import $ from 'jquery'
import _ from 'lodash'
import mime from 'mime'

import tr, { setCurrentLanguage } from './utils/translate'
import isString from './utils/is-string'
import base64Array from 'base64-js' // https://github.com/beatgammit/base64-js
import getQueryParam from './utils/get-query-param'

import { CFMAppOptions, CFMMenuItem, CFMUIMenuOptions, isCustomClientProvider } from './app-options'
import { CloudFileManagerUI, UIEventCallback }  from './ui'

import LocalStorageProvider  from './providers/localstorage-provider'
import ReadOnlyProvider  from './providers/readonly-provider'
import GoogleDriveProvider  from './providers/google-drive-provider'
import InteractiveApiProvider from './providers/interactive-api-provider'
import LaraProvider  from './providers/lara-provider'
import DocumentStoreProvider  from './providers/document-store-provider'
import S3ShareProvider  from './providers/s3-share-provider'
import S3Provider  from './providers/s3-provider'
import LocalFileProvider  from './providers/local-file-provider'
import PostMessageProvider  from './providers/post-message-provider'
import URLProvider  from './providers/url-provider'
import TestProvider  from './providers/test-provider'
import ClassRailsProvider from './providers/class-rails-provider'

import {
  CloudContent, cloudContentFactory, CloudMetadata, ECapabilities, ProviderInterface
}  from './providers/provider-interface'
import { reportError } from "./utils/report-error"
import { SelectInteractiveStateCallback, SelectInteractiveStateDialogProps } from './views/select-interactive-state-dialog-view'
import { IGetInteractiveState, setOnUnload } from '@concord-consortium/lara-interactive-api'
import {
  postiframeLoadedMessageToParent,
  registerLoadProjectPostMessage,
  registerReloadPostMessage,
  registerSavePostMessage,
} from "./post-message-manager"
import { createBlobAndUrlFromFile } from "./api/directUploads"
import getHashParam from './utils/get-hash-param'

let CLOUDFILEMANAGER_EVENT_ID = 0
const CLOUDFILEMANAGER_EVENTS: Record<number, CloudFileManagerClientEvent> = {}

interface IClientState {
  availableProviders: any[]
  shareProvider?: any
  openedContent?: any
  currentContent?: any
  metadata?: CloudMetadata
  saving?: CloudMetadata | null
  saved?: boolean
  sharing?: boolean
  dirty?: boolean
  failures?: number
  showingSaveAlert?: boolean
}

export type ClientEventCallback = (...args: any) => void

export type CFMFileChangedEventType = "renamedFile" | "savedFile" | "sharedFile" | "unsharedFile"
export type CFMFileEventType = CFMFileChangedEventType | "closedFile" | "newedFile" | "openedFile" | "willOpenFile"
export type CloudFileManagerEventType = "connected" | "getContent" | "importedData" | "log" | "ready" |
              "rendered" | "requiresUserInteraction" | "stateChanged" | "getEmptyContent" | CFMFileEventType

class CloudFileManagerClientEvent {
  callback: ClientEventCallback
  data: any
  id: number
  state: Partial<IClientState>
  type: CloudFileManagerEventType

  constructor(type: CloudFileManagerEventType, data?: any, callback: ClientEventCallback = null, state?: Partial<IClientState>) {
    this.type = type
    if (data == null) { data = {} }
    this.data = data
    this.callback = callback
    if (state == null) { state = {} }
    this.state = state
    CLOUDFILEMANAGER_EVENT_ID++
    this.id = CLOUDFILEMANAGER_EVENT_ID
  }

  postMessage(iframe: any) {
    if (this.callback) {
      CLOUDFILEMANAGER_EVENTS[this.id] = this
    }
    // remove client from data to avoid structured clone error in postMessage
    const eventData = _.clone(this.data)
    delete eventData.client
    const message = {type: "cfm::event", eventId: this.id, eventType: this.type, eventData}
    return iframe.postMessage(message, "*")
  }
}

export type ClientEventListener = (event: CloudFileManagerClientEvent) => void
export type OpenSaveCallback = (content: any, metadata: CloudMetadata, savedContent?: any) => void
type OpenProviderFileCallback = (updatedAt: string | null) => void

class CloudFileManagerClient {
  _autoSaveInterval: number
  _listeners: ClientEventListener[]
  _ui: CloudFileManagerUI
  appOptions: CFMAppOptions
  iframe: any
  newFileAddsNewToQuery: boolean
  newFileOpensInNewTab: boolean
  providers: Record<string, ProviderInterface>
  state: IClientState
  urlProvider: URLProvider
  connectedPromise: Promise<void>
  connectedPromiseResolver: { resolve: () => void, reject: () => void }

  constructor(options?: any) {
    this.shouldAutoSave = this.shouldAutoSave.bind(this)
    this.state = {availableProviders: []}
    this._listeners = []
    this._resetState()
    this._ui = new CloudFileManagerUI(this)
    this.providers = {}
    this.urlProvider = new URLProvider()

    this.onUnload = this.onUnload.bind(this)
    setOnUnload(this.onUnload)

    this.connectedPromise = new Promise((resolve, reject) => {
      this.connectedPromiseResolver = {
        resolve: () => {
          resolve()
          this.connectedPromiseResolver = null
        },
        reject: () => {
          reject()
          this.connectedPromiseResolver = null
        }
      }
    })
  }

  setAppOptions(appOptions: CFMAppOptions) {
    let providerName
    let Provider
    if (appOptions == null) { appOptions = {} }
    this.appOptions = appOptions
    if (this.appOptions.wrapFileContent == null) { this.appOptions.wrapFileContent = true }
    CloudContent.wrapFileContent = this.appOptions.wrapFileContent
    if (this.appOptions.isClientContent) CloudContent.isClientContent = this.appOptions.isClientContent

    type ProviderClass = any
    const allProviders: Record<string, ProviderClass> = {}

    // Determine the available providers. Note that order in the list can
    // be significant in provider searches (e.g. @autoProvider).
    const providerList = [
      LocalStorageProvider,
      ReadOnlyProvider,
      GoogleDriveProvider,
      LaraProvider,
      InteractiveApiProvider,
      DocumentStoreProvider,
      LocalFileProvider,
      PostMessageProvider,
      S3Provider,
      ClassRailsProvider,
      TestProvider
    ]
    for (Provider of providerList) {
      if (Provider.Available()) {
        allProviders[(Provider as any).Name] = Provider
      }
    }

    // default to all providers if none specified
    if (!this.appOptions.providers) {
      this.appOptions.providers = []
      for (providerName of Object.keys(allProviders || {})) {
        appOptions.providers.push(providerName)
      }
    }

    // preset the extension if Available
    CloudMetadata.Extension = this.appOptions.extension
    CloudMetadata.ReadableExtensions = this.appOptions.readableExtensions || []
    if (CloudMetadata.Extension) { CloudMetadata.ReadableExtensions.push(CloudMetadata.Extension) }

    const readableMimetypes = this.appOptions.readableMimeTypes || []
    readableMimetypes.push(this.appOptions.mimeType)

    // check the providers
    const requestedProviders = this.appOptions.providers.slice()
    if (getQueryParam("saveSecondaryFileViaPostMessage")) {
      requestedProviders.push('postMessage')
    }
    const isInteractiveApiRequested = requestedProviders.includes('interactiveApi')
    const availableProviders = []
    let shareProvider = null
    for (let providerSpec of requestedProviders) {
      const [providerName, providerOptions] = isString(providerSpec)
                                                ? [providerSpec, {}]
                                                : [providerSpec.name, providerSpec]
      // merge in other options as needed
      if (providerOptions.mimeType == null) { providerOptions.mimeType = this.appOptions.mimeType }
      providerOptions.readableMimetypes = readableMimetypes
      if (!providerName) {
        this.alert("Invalid provider spec - must either be string or object with name property")
      } else {
        if (isCustomClientProvider(providerOptions)) {
          allProviders[providerName] = providerOptions.createProvider(ProviderInterface)
        }
        if (allProviders[providerName]) {
          Provider = allProviders[providerName]
          // don't add providers that require configuration if no (or invalid) configuration provided
          if (!Provider.hasValidOptions || Provider.hasValidOptions(providerOptions)) {
            const provider = new Provider(providerOptions, this)
            this.providers[providerName] = provider
            shareProvider = this._getShareProvider()
            // also add to here in providers list so we can look it up when parsing url hash
            if (provider.urlDisplayName) {
              this.providers[provider.urlDisplayName] = provider
            }
            availableProviders.push(provider)

            // InteractiveApiProvider is a newer form of Lara provider
            if (!isInteractiveApiRequested && (providerName === "lara")) {
              const interactiveApiProvider = new InteractiveApiProvider(providerOptions, this)
              this.providers.interactiveApi = interactiveApiProvider
              availableProviders.push(interactiveApiProvider)
            }
          }
        } else {
          this.alert(`Unknown provider: ${providerName}`)
        }
      }
    }
    this._setState({
      availableProviders,
      shareProvider
    })

    if (!this.appOptions.ui) { this.appOptions.ui = {} }
    if (!this.appOptions.ui.windowTitleSuffix) { this.appOptions.ui.windowTitleSuffix = document.title }
    if (!this.appOptions.ui.windowTitleSeparator) { this.appOptions.ui.windowTitleSeparator = ' - ' }
    this._setWindowTitle()

    this._ui.init(this.appOptions.ui)

    // check for autosave
    if (this.appOptions.autoSaveInterval) {
      this.autoSave(this.appOptions.autoSaveInterval)
    }

    // initialize the cloudContentFactory with all data we want in the envelope
    cloudContentFactory.setEnvelopeMetadata({
      cfmVersion: '__PACKAGE_VERSION__', // replaced by version number at build time
      appName: this.appOptions.appName || "",
      appVersion: this.appOptions.appVersion || "",
      appBuildNum: this.appOptions.appBuildNum || ""
    })

    this.newFileOpensInNewTab = this.appOptions.ui?.newFileOpensInNewTab ?? true
    this.newFileAddsNewToQuery = this.appOptions.ui?.newFileAddsNewToQuery

    if (this.appOptions.ui?.confirmCloseIfDirty) {
      this._setupConfirmOnClose()
    }

    // "save" postMessage에 대한 이벤트 등록
    registerSavePostMessage(this.save.bind(this))
    // "reload" postMessage에 대한 이벤트 등록
    registerReloadPostMessage(async () => {
      const hashFileParams = getHashParam("file")
      const [providerName, providerParams] = hashFileParams.split(":")
      return await new Promise((resolve) => {
        this.openProviderFile(providerName, providerParams, (updatedAt) => {
          resolve(updatedAt)
        })
      })
    })
    // "loadProject" postMessage에 대한 이벤트 등록
    registerLoadProjectPostMessage(async (projectId: string) => {
      window.location.hash = `file=classRails:${projectId}`
      const hashFileParams = getHashParam("file")
      const [providerName, providerParams] = hashFileParams.split(":")
      return await new Promise((resolve) => {
        this.openProviderFile(providerName, providerParams, (updatedAt) => {
          resolve(updatedAt)
        })
      })
    })

    return this._startPostMessageListener()
  }

  _getShareProvider() {
    return new S3ShareProvider(this, new S3Provider(this))
  }

  setProviderOptions(name: string, newOptions: Record<string, any>) {
    for (let provider of this.state.availableProviders) {
      if (provider.name === name) {
        provider.options = { ...provider.options, newOptions }
        break
      }
    }
  }

  connect() {
    this.connectedPromiseResolver?.resolve()
    return this._event('connected', {client: this})
  }

  //
  // Called from CloudFileManager.clientConnect to process the URL parameters
  // and initiate opening any document specified by URL parameters. The CFM
  // hash params are processed here after which providers are given a chance
  // to process any provider-specific URL parameters. Calls ready() if no
  // initial document opening occurs.
  //
  processUrlParams() {
    // process the hash params
    let providerName
    const { hashParams } = this.appOptions
    if (hashParams.sharedContentId) {
      return this.openSharedContent(hashParams.sharedContentId)
    } else if (hashParams.fileParams) {
      if (hashParams.fileParams.indexOf("http") === 0) {
        return this.openUrlFile(hashParams.fileParams)
      } else {
        let providerParams;
        [providerName, providerParams] = hashParams.fileParams.split(':')
        return this.openProviderFile(providerName, providerParams)
      }
    } else if (hashParams.copyParams) {
      return this.openCopiedFile(hashParams.copyParams)
    } else if (hashParams.newInFolderParams) {
      let folder;
      [providerName, folder] = hashParams.newInFolderParams.split(':')
      return this.createNewInFolder(providerName, folder)
    } else if (this.haveTempFile()) {
      return this.openAndClearTempFile()
    } else {
      // give providers a chance to process url params
      for (let provider of this.state.availableProviders) {
        if (provider.handleUrlParams()) { return }
      }

      // if no providers handled it, then just signal ready()
      return this.ready()
    }
  }

  ready() {
    postiframeLoadedMessageToParent()
    return this._event('ready')
  }

  rendered() {
    return this._event('rendered', {client: this})
  }

  listen(listener: ClientEventListener) {
    if (listener) {
      return this._listeners.push(listener)
    }
  }

  log(event: string, eventData: any) {
    this._event('log', {logEvent: event, logEventData: eventData})
    if (this.appOptions.log) {
      return this.appOptions.log(event, eventData)
    }
  }

  autoProvider(capability: ECapabilities) {
    for (let provider of this.state.availableProviders) {
      if (provider.canAuto(capability)) { return provider }
    }
  }

  replaceMenu(options: CFMUIMenuOptions) {
    this._ui.replaceMenu(options)
  }

  appendMenuItem(item: CFMMenuItem) {
    this._ui.appendMenuItem(item)
    return this
  }

  prependMenuItem(item: CFMMenuItem) {
    this._ui.prependMenuItem(item)
    return this
  }

  replaceMenuItem(key: string, item: CFMMenuItem) {
    this._ui.replaceMenuItem(key, item)
    return this
  }

  insertMenuItemBefore(key: string, item: CFMMenuItem) {
    this._ui.insertMenuItemBefore(key, item)
    return this
  }

  insertMenuItemAfter(key: string, item: CFMMenuItem) {
    this._ui.insertMenuItemAfter(key, item)
    return this
  }

  setMenuBarInfo(info: string) {
    return this._ui.setMenuBarInfo(info)
  }

  newFile(callback: ClientEventCallback = null) {
    this._closeCurrentFile()
    this._resetState()
    window.location.hash = ""
    return this._event('newedFile', {content: ""}, callback)
  }

  newFileDialog(callback: ClientEventCallback = null) {
    if (this.newFileOpensInNewTab) {
      return window.open(this.getCurrentUrl(this.newFileAddsNewToQuery ? "#new" : null), '_blank')
    } else if (this.state.dirty) {
      if (this._autoSaveInterval && this.state.metadata) {
        this.save()
        return this.newFile(callback)
      } else {
        return this.confirm(tr('~CONFIRM.NEW_FILE'), () => this.newFile(callback))
      }
    } else {
      return this.newFile(callback)
    }
  }

  openFile(metadata: CloudMetadata, callback: OpenSaveCallback = null) {
    if (metadata?.provider?.can(ECapabilities.load, metadata)) {
      this._event('willOpenFile', {op: "openFile"})
      return metadata.provider.load(metadata, (err: string | null, content: any) => {
        if (err) {
          return this.alert(err, () => this.ready())
        }
        // should wait to close current file until client signals open is complete
        this._closeCurrentFile()
        content = this._filterLoadedContent(content)
        this._fileOpened(content, metadata, {openedContent: content.clone()}, this._getHashParams(metadata))
        if (typeof callback === 'function') {
          callback(content, metadata)
        }
        return metadata.provider.fileOpened(content, metadata)
      })
    } else {
      return this.openFileDialog(callback)
    }
  }

  openFileDialog(callback: OpenSaveCallback = null): any {
    const showDialog = () => {
      return this._ui.openFileDialog((metadata: CloudMetadata) => {
        return this.openFile(metadata, callback)
      })
    }
    if (!this.state.dirty) {
      return showDialog()
    } else {
      return this.confirm(tr('~CONFIRM.OPEN_FILE'), showDialog)
    }
  }

  closeFile(callback: () => void = null) {
    this._closeCurrentFile()
    this._resetState()
    window.location.hash = ""
    this._event('closedFile', {content: ""})
    return (typeof callback === 'function' ? callback() : undefined)
  }

  closeFileDialog(callback: () => void = null) {
    if (!this.state.dirty) {
      return this.closeFile(callback)
    } else {
      return this.confirm(tr('~CONFIRM.CLOSE_FILE'), () => this.closeFile(callback))
    }
  }

  importData(data: any, callback: (data: any) => void = null) {
    this._event('importedData', data)
    return (typeof callback === 'function' ? callback(data) : undefined)
  }

  importDataDialog(callback: (data: any) => void = null) {
    return this._ui.importDataDialog((data: any) => {
      return this.importData(data, callback)
    })
  }

  readLocalFile(file: any, callback: (args: { name: string, content: any }) => void = null) {
    const reader = new FileReader()
    reader.onload = loaded => typeof callback === 'function' ? callback({name: file.name, content: loaded.target.result}) : undefined
    return reader.readAsText(file)
  }

  openLocalFile(file: any, callback: OpenSaveCallback = null) {
    this._event('willOpenFile', {op: "openLocalFile"})
    return this.readLocalFile(file, (data: any) => {
      let content = cloudContentFactory.createEnvelopedCloudContent(data.content)
      content = this._filterLoadedContent(content)
      const metadata = new CloudMetadata({
        name: data.name,
        type: CloudMetadata.File
      })
      this._fileOpened(content, metadata, {openedContent: content.clone()})
      return (typeof callback === 'function' ? callback(content, metadata) : undefined)
    })
  }

  openLocalFileWithConfirmation(file: any, callback: OpenSaveCallback = null) {
    const openFile = () => this.openLocalFile(file, callback)
    if (!this.state.dirty) {
      return openFile()
    } else {
      return this.confirm(tr('~CONFIRM.OPEN_FILE'), openFile)
    }  
  }

  importLocalFile(file: any, callback: (data: any) => void = null) {
    return this.readLocalFile(file, (data: any) => {
      return this.importData(data, callback)
    })
  }

  openSharedContent(id: string) {
    const { shareProvider } = this.state
    this._event('willOpenFile', {op: "openSharedContent"})
    if(shareProvider.loadSharedContent) {
      shareProvider.loadSharedContent(id, (err: string | null, content: any, metadata: CloudMetadata) => {
        if (err) {
          this.alert(err, () => this.ready())
        }
        else {
          content = this._filterLoadedContent(content)
          this._fileOpened(content, metadata, {overwritable: false, openedContent: content.clone()})
        }
      })
    }
  }

  // must be called as a result of user action (e.g. click) to avoid popup blockers
  parseUrlAuthorizeAndOpen() {
    if (this.appOptions.hashParams?.fileParams != null) {
      const [providerName, providerParams] = this.appOptions.hashParams.fileParams.split(':')
      const provider = this.providers[providerName]
      if (provider) {
        return provider.authorize(() => {
          return this.openProviderFile(providerName, providerParams)
        })
      }
    }
  }

  /**
   * Disassociates the current document from its provider.
   *
   * This is important specifically for autosaving providers. When authenticated
   * state is lost we must not continue to autosave.
   */
  disconnectCurrentFile() {
    console.warn('Closing file (rejected reauth)')
    if (this.state.metadata) { this.state.metadata.provider = null }
    this._setState({saving: null, saved: null})
    window.location.hash = ""
    this._event('ready')
  }

  confirmAuthorizeAndOpen(provider: ProviderInterface, providerParams: any) {
    const rejectCallback = () => this.disconnectCurrentFile()
    // trigger authorize() from confirmation dialog to avoid popup blockers
    return this.confirm(tr("~CONFIRM.AUTHORIZE_OPEN"), () => {
        return provider.authorize(() => {
          this._event('willOpenFile', {op: "confirmAuthorizeAndOpen"})
          return provider.openSaved(providerParams, (err: string | null, content: any, metadata: CloudMetadata) => {
            if (err) {
              return this.alert(err)
            }
            content = this._filterLoadedContent(content)
            this._fileOpened(content, metadata, {openedContent: content.clone()}, this._getHashParams(metadata))
            return provider.fileOpened(content, metadata)
          })
        })
      },
      rejectCallback
    )
  }

  openProviderFileWhenConnected(providerName: string, providerParams?: any) {
    this.connectedPromise.then(() => this.openProviderFile(providerName, providerParams))
  }

  openProviderFile(providerName: string, providerParams?: any, callback: OpenProviderFileCallback = null) {
    const provider = this.providers[providerName]
    if (provider) {
      return provider.authorized((isAuthorized: boolean) => {
        // we can open the document without authorization in some cases
        if (isAuthorized || !provider.isAuthorizationRequired()) {
          this._event('willOpenFile', {op: "openProviderFile"})
          return provider.openSaved(providerParams, async (err: string | null, content: any, metadata: CloudMetadata) => {
            if (err) {
              return this.alert(err, () => {
                this.ready()
                return callback?.(null)
              })
            }

            // content가 null 값인 경우, EmptyContent 값을 받아와 content를 생성합니다.
            if (!content) {
              const emptyContent = await new Promise((resolve) =>
                this._event("getEmptyContent", {}, (emptyContent: any) => {
                  resolve(emptyContent)
                })
              )
              content = cloudContentFactory.createEnvelopedCloudContent(emptyContent)
            }
            
            // if we just opened the file, it doesn't need to be saved until the contents are changed unless
            // it requires conversion from an older version
            content = this._filterLoadedContent(content)
            const additionalState = { openedContent: content.clone(), dirty: content.requiresConversion() }
            this._fileOpened(content, metadata, additionalState, this._getHashParams(metadata))
            provider.fileOpened(content, metadata) 
            return callback?.(metadata.providerData?.projectDataUpdatedAt)
          })
        } else {
          this.confirmAuthorizeAndOpen(provider, providerParams)
          return callback?.(null)
        }
      }, {forceAuthorization: true}) // force authorization for Google Drive
    } else {
      return this.alert(tr("~ALERT.NO_PROVIDER"), () => {
        this.ready()
        return callback?.(null)
      })
    }
  }

  openUrlFile(url: string) {
    return this.urlProvider.openFileFromUrl(url, (err: string | null, content: any, metadata: CloudMetadata) => {
      this._event('willOpenFile', {op: "openUrlFile"})
      if (err) {
        return this.alert(err, () => this.ready())
      }
      content = this._filterLoadedContent(content)
      return this._fileOpened(content, metadata, {openedContent: content.clone()}, this._getHashParams(metadata))
    })
  }

  createNewInFolder(providerName: string, folder: string) {
    const provider = this.providers[providerName]
    if (provider && provider.can(ECapabilities.setFolder, this.state.metadata)) {
      if ((this.state.metadata == null)) {
        this.state.metadata = new CloudMetadata({
          type: CloudMetadata.File,
          provider
        })
      }

      this.state.metadata.parent = new CloudMetadata({
        type: CloudMetadata.Folder,
        providerData: {
          id: folder
        }
      })

      this._ui.editInitialFilename()
    }
    return this._event('newedFile', {content: ""})
  }

  setInitialFilename(filename: string) {
    this.state.metadata.rename(filename)
    return this.save()
  }

  isSaveInProgress() {
    return (this.state.saving != null)
  }

  confirmAuthorizeAndSave(stringContent: any, callback?: OpenSaveCallback) {
    let rejectCallback = () => {this.disconnectCurrentFile()}
    // trigger authorize() from confirmation dialog to avoid popup blockers
    return this.confirm(tr("~CONFIRM.AUTHORIZE_SAVE"), () => {
      return this.state.metadata.provider.authorize(() => {
        return this.saveFile(stringContent, this.state.metadata, callback)
      })
    },
    rejectCallback)
  }

  save(callback: OpenSaveCallback = null) {
    return this._event('getContent', { shared: this._sharedMetadata() }, (stringContent: any) => {
      return this.saveContent(stringContent, callback)
    })
  }

  saveContent(stringContent: any, callback: OpenSaveCallback = null) {
    const provider = this.state.metadata?.provider || this.autoProvider(ECapabilities.save)
    if (provider != null) {
      return provider.authorized((isAuthorized: boolean) => {
        // we can save the document without authorization in some cases
        if (isAuthorized || !provider.isAuthorizationRequired()) {
          return this.saveFile(stringContent, this.state.metadata, callback)
        } else {
          return this.confirmAuthorizeAndSave(stringContent, callback)
        }
      })
    } else {
      return this.saveFileDialog(stringContent, callback)
    }
  }

  saveFile(stringContent: any, metadata: CloudMetadata, callback: OpenSaveCallback = null) {
    // metadata에 상관없이 ClassRailsProvider를 사용하도록 수정
    metadata.provider = this.providers.classRails

    const readonly = metadata && !metadata.overwritable // only check if metadata exists
    const resaveable = metadata?.provider?.can(ECapabilities.resave, metadata)

    // must be able to 'resave' to save silently, i.e. without save dialog
    if (!readonly && resaveable) {
      return this.saveFileNoDialog(stringContent, metadata, callback)
    } else {
      return this.saveFileDialog(stringContent, callback)
    }
  }

  saveFileNoDialog(stringContent: any, metadata: CloudMetadata, callback: OpenSaveCallback = null) {
    this._setState({
      saving: metadata})
    let currentContent = this._createOrUpdateCurrentContent(stringContent, metadata)
    currentContent = this.appOptions.contentSaveFilter?.(currentContent) || currentContent

    return metadata.provider.save(currentContent, metadata, (err, statusCode, savedContent) => {
      let failures
      if (err) {
        if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
          // disable autosave while the confirmation dialog is showing
          metadata.autoSaveDisabled = true
          this._setState({ metadata, saving: null })
          return this.confirmAuthorizeAndSave(stringContent, callback)
        } else {
          this._setState({ saving: null })
          failures = this.state.failures
          if (!failures) {
            failures = 1
          } else {
            failures++
          }
          if (failures === 1) {
            this._setState({ failures, showingSaveAlert: true })
            let error = err.toString()
            if (this.isAutoSaving()) {
              error = `${error}<br><br>${tr("~FILE_STATUS.CONTINUE_SAVE")}`
            }
            return this.alert(error, () => {
              this._setState({ showingSaveAlert: false })
            })
          } else {
            this._setState({ failures })
          }
        }
      } else {
        if (this.state.showingSaveAlert) {
          this.hideAlert()
        }
        this._setState({ failures: 0, showingSaveAlert: false })
        if (this.state.metadata !== metadata) {
          this._closeCurrentFile()
        }
        // reenable autosave on save success if this isn't a local file save
        if (metadata.autoSaveDisabled != null) {
          delete metadata.autoSaveDisabled
        }
        this._fileChanged('savedFile', currentContent, metadata, {saved: true}, this._getHashParams(metadata))
        return (typeof callback === 'function' ? callback(currentContent, metadata, savedContent) : undefined)
      }
    })
  }

  saveFileDialog(stringContent: any = null, callback: OpenSaveCallback = null) {
    return this._ui.saveFileDialog((metadata: CloudMetadata) => {
      return this._dialogSave(stringContent, metadata, callback)
    })
  }

  saveFileAsDialog(stringContent: any = null, callback: OpenSaveCallback = null) {
    return this._ui.saveFileAsDialog((metadata: CloudMetadata) => {
      return this._dialogSave(stringContent, metadata, callback)
    })
  }

  createCopy(stringContent: any = null, callback: (errOrCopyParams?: number | string) => void = null) {
    const saveAndOpenCopy = (stringContent: any) => {
      return this.saveCopiedFile(stringContent, this.state.metadata?.name, (err: string | null, copyParams?: number) => {
        if (err) { return (typeof callback === 'function' ? callback(err) : undefined) }
        window.open(this.getCurrentUrl(`#copy=${copyParams}`))
        return (typeof callback === 'function' ? callback(copyParams) : undefined)
      })
    }
    if (stringContent == null) {
      return this._event('getContent', {}, (stringContent: any) => saveAndOpenCopy(stringContent))
    } else {
      return saveAndOpenCopy(stringContent)
    }
  }

  saveCopiedFile(stringContent: any, name?: string, callback?: (err: string | null, maxCopyNumber?: number) => void) {
    try {
      const prefix = 'cfm-copy::'
      let maxCopyNumber = 0
      for (let key of Object.keys(window.localStorage || {})) {
        if (key.substr(0, prefix.length) === prefix) {
          const copyNumber = parseInt(key.substr(prefix.length), 10)
          maxCopyNumber = Math.max(maxCopyNumber, copyNumber)
        }
      }
      maxCopyNumber++
      const value = JSON.stringify({
        name: name?.length ? `Copy of ${name}` : "Copy of Untitled Document",
        stringContent
      })
      window.localStorage.setItem(`${prefix}${maxCopyNumber}`, value)
      return (typeof callback === 'function' ? callback(null, maxCopyNumber) : undefined)
    } catch (e) {
      // CODAP style overrides
      const divStyle = "text-align: left"
      const paragraphStyle = "margin: 10px 0;"
      const listStyle = "margin: 10px 10px 10px 30px; padding: 0;"

      const message = `
      <div style="${divStyle}">
        <p style="${paragraphStyle}">The document is either too large to copy within the app, or your browser does not allow local storage.</p>

        <p style="${paragraphStyle}">To copy this file you must duplicate it outside the app using these steps:</p>

        <ol style="${listStyle}">
          <li>Save the document.</li>
          <li>Duplicate it using Google Drive or your local file system.</li>
          <li>Open or import the newly duplicated document.</li>
        </ol>
      </div>
      `
      return this.alert(message, "Copy Error")
    }
  }

  openCopiedFile(copyParams: string) {
    this._event('willOpenFile', {op: "openCopiedFile"})
    try {
      const key = `cfm-copy::${copyParams}`
      const copied = JSON.parse(window.localStorage.getItem(key))
      let content = cloudContentFactory.createEnvelopedCloudContent(copied.stringContent)
      content = this._filterLoadedContent(content)
      const metadata = new CloudMetadata({
        name: copied.name,
        type: CloudMetadata.File
      })
      window.location.hash = ""
      this._fileOpened(content, metadata, {dirty: true, openedContent: content.clone()})
      return window.localStorage.removeItem(key)
    } catch (e) {
      reportError("Unable to load copied file")
    }
  }

  haveTempFile() {
    try {
      const key = "cfm-tempfile"
      return !!(JSON.parse(window.localStorage.getItem(key)))
    } catch (e) {
      return false
    }
  }

  saveTempFile(callback?: (err: string | null) => void) {
    return this._event('getContent', { shared: this._sharedMetadata() }, (stringContent: any) => {
      const currentContent = this._createOrUpdateCurrentContent(stringContent)
      try {
        const key = "cfm-tempfile"
        const name = this.state.metadata?.name
        const value = JSON.stringify({ name, stringContent })
        window.localStorage.setItem(key, value)
        const metadata = new CloudMetadata({
          name,
          type: CloudMetadata.File
        })
        this._fileChanged('savedFile', currentContent, metadata, {saved: true}, "")
        return callback?.(null)
      } catch (e) {
        return callback?.("Unable to temporarily save copied file")
      }
    })
  }

  openAndClearTempFile() {
    this._event('willOpenFile', {op: "openAndClearTempFile"})
    try {
      const key = "cfm-tempfile"
      const { name, stringContent } = JSON.parse(window.localStorage.getItem(key))
      let content = cloudContentFactory.createEnvelopedCloudContent(stringContent)
      content = this._filterLoadedContent(content)
      const metadata = new CloudMetadata({
        name,
        type: CloudMetadata.File
      })
      this._fileOpened(content, metadata, {dirty: true, openedContent: content.clone()})
      return window.localStorage.removeItem(key)
    } catch (e) {
      reportError("Unable to load temp file")
    }
  }

  _sharedMetadata() {
    return this.state.currentContent?.getSharedMetadata() || {}
  }

  shareGetLink() {
    return this._ui.shareDialog(this)
  }

  shareUpdate() {
    return this.share(() => this.alert((tr("~SHARE_UPDATE.MESSAGE")), (tr("~SHARE_UPDATE.TITLE"))))
  }

  toggleShare(callback: (err: string | null, sharedContentId?: string) => void) {
    if (this.isShared()) {
      return this.unshare(callback)
    } else {
      return this.share(callback)
    }
  }

  isShared() {
    const currentContent = this.state?.currentContent
    if(currentContent) {
      const unshared = currentContent.get("isUnshared")
      if(!unshared) {
        const sharedDocumentId = currentContent.get("sharedDocumentId")
        const sharedDocumentUrl = currentContent.get("sharedDocumentUrl")
        return (sharedDocumentId || sharedDocumentUrl)
      }
    }
    return false
  }

  canEditShared() {
    const accessKeys = (this.state.currentContent != null ? this.state.currentContent.get("accessKeys") : undefined) || {}
    const shareEditKey = this.state.currentContent != null ? this.state.currentContent.get("shareEditKey") : undefined
    return (shareEditKey || accessKeys.readWrite) && !(this.state.currentContent != null ? this.state.currentContent.get("isUnshared") : undefined)
  }

  setShareState(shared: boolean, callback?: (err: string | null, sharedContentId: string, currentContent: any) => void) {
    if (this.state.shareProvider) {
      const sharingMetadata = this.state.shareProvider.getSharingMetadata(shared)
      return this._event('getContent', { shared: sharingMetadata }, (stringContent: any) => {
        this._setState({ sharing: shared })
        const sharedContent = cloudContentFactory.createEnvelopedCloudContent(stringContent)
        sharedContent.addMetadata(sharingMetadata)
        const currentContent = this._createOrUpdateCurrentContent(stringContent, this.state.metadata)
        sharedContent.set('docName', currentContent.get('docName'))
        // save the current name at the top level so it is displayed when the shared file is loaded
        if (this.state.metadata) {
          sharedContent.getClientContent().name = this.state.metadata.name
        }
        if (shared) {
          currentContent.remove('isUnshared')
        } else {
          currentContent.set('isUnshared', true)
        }
        return this.state.shareProvider.share(shared, currentContent, sharedContent, this.state.metadata, (err: string | null, sharedContentId: any) => {
          if (err) {
            return this.alert(err)
          }
          return callback?.(null, sharedContentId, currentContent)
        })
      })
    }
  }

  share(callback?: (err: string | null, sharedContentId: string) => void) {
    if (!this.state.metadata) {
      // PJ, 07/10/2020: Without these lines the sharing process will fail (it looks for filename and later tries to
      // update metadata object). Apparently, there's an assumption that metadata already exists. It can initialized
      // in a few random places, but a new document that has never been renamed won't have this object available.
      this.state.metadata = new CloudMetadata({
        name: tr("~MENUBAR.UNTITLED_DOCUMENT"),
        type: CloudMetadata.File
      })
    }
    return this.setShareState(true, (err: string | null, sharedContentId: string, currentContent: any) => {
      this._fileChanged('sharedFile', currentContent, this.state.metadata)
      return callback?.(null, sharedContentId)
    })
  }

  unshare(callback?: (err: string | null) => void) {
    return this.setShareState(false, (err: string | null, sharedContentId: string, currentContent: any) => {
      this._fileChanged('unsharedFile', currentContent, this.state.metadata)
      return callback?.(null)
    })
  }

  revertToShared(callback: (err: string | null) => void = null) {
    // Look for sharedDocumentUrl or Url first:
    const id = this.state.currentContent?.get("sharedDocumentUrl")
            || this.state.currentContent?.get("url")
            || this.state.currentContent?.get("sharedDocumentId")

    if (id && (this.state.shareProvider != null)) {
      return this.state.shareProvider.loadSharedContent(id, (err: string | null, content: any, metadata: CloudMetadata) => {
        let docName
        if (err) {
          return this.alert(err)
        }
        content = this._filterLoadedContent(content)
        this.state.currentContent.copyMetadataTo(content)
        if (!metadata.name && (docName = content.get('docName'))) {
          metadata.name = docName
        }
        this._fileOpened(content, metadata, {dirty: true, openedContent: content.clone()})
        return callback?.(null)
      })
    }
  }

  revertToSharedDialog(callback: (err: string | null) => void = null) {
    if ((this.state.currentContent != null ? this.state.currentContent.get("sharedDocumentId") : undefined) && (this.state.shareProvider != null)) {
      return this.confirm(tr("~CONFIRM.REVERT_TO_SHARED_VIEW"), () => this.revertToShared(callback))
    }
  }

  downloadDialog(callback: UIEventCallback = null) {
    // should share metadata be included in downloaded local files?
    return this._event('getContent', { shared: this._sharedMetadata() }, (content: any) => {
      const envelopedContent = cloudContentFactory.createEnvelopedCloudContent(content)
      if (this.state.currentContent != null) {
        this.state.currentContent.copyMetadataTo(envelopedContent)
      }
      return this._ui.downloadDialog(this.state.metadata?.name, envelopedContent, callback)
    })
  }

  getDownloadBlob(content: any, includeShareInfo: boolean, mimeType: string) {
    let contentToSave
    if (mimeType == null) { mimeType = 'text/plain' }
    if (typeof content === "string") {
      if (mimeType.indexOf("image") >= 0) {
        contentToSave = base64Array.toByteArray(content)
      } else {
        contentToSave = content
      }

    } else if (includeShareInfo) {
      contentToSave = JSON.stringify(content.getContent())

    } else { // not includeShareInfo
      // clone the document so we can delete the share info and not affect the original
      const json = content.clone().getContent()
      delete json.sharedDocumentId
      delete json.sharedDocumentUrl
      delete json.shareEditKey
      delete json.isUnshared
      delete json.accessKeys
      // CODAP moves the keys into its own namespace
      if (json.metadata?.shared != null) {
        delete json.metadata.shared
      }
      contentToSave = JSON.stringify(json)
    }

    return new Blob([contentToSave], {type: mimeType})
  }

  getDownloadUrl(content: any, includeShareInfo: boolean, mimeType: string) {
    if (mimeType == null) { mimeType = 'text/plain' }
    const wURL = window.URL || window.webkitURL
    if (wURL) { return wURL.createObjectURL(this.getDownloadBlob(content, includeShareInfo, mimeType)) }
  }

  rename(metadata: CloudMetadata, newName: string, callback?: (newName: string) => void) {
    const { dirty } = this.state
    const _rename = (metadata: CloudMetadata) => {
      if (this.state.currentContent != null) {
        this.state.currentContent.addMetadata({docName: metadata.name})
      }
      this._fileChanged('renamedFile', this.state.currentContent, metadata, {dirty}, this._getHashParams(metadata))

      const done = () => typeof callback === 'function' ? callback(newName) : undefined

      const readOnlyProvider = metadata?.provider?.name === ReadOnlyProvider.Name
      if (!readOnlyProvider && (metadata?.provider || this.autoProvider(ECapabilities.save))) {
        // autosave renamed file if it has already been saved or can be autosaved
        this.save(done)
      } else {
        done()
      }
    }
    if (newName !== (this.state.metadata != null ? this.state.metadata.name : undefined)) {
      if (metadata?.provider?.can(ECapabilities.rename, metadata)) {
        return this.state.metadata.provider.rename(this.state.metadata, newName, (err: string | null, metadata: CloudMetadata) => {
          if (err) {
            return this.alert(err)
          }
          return _rename(metadata)
        })
      } else {
        if (metadata) {
          metadata.rename(newName)
        } else {
          metadata = new CloudMetadata({
            name: newName,
            type: CloudMetadata.File
          })
        }
        return _rename(metadata)
      }
    }
  }

  renameDialog(callback: (newName: string) => void = null) {
    return this._ui.renameDialog(this.state.metadata != null ? this.state.metadata.name : undefined, (newName: any) => {
      return this.rename(this.state.metadata, newName, callback)
    })
  }

  revertToLastOpened(callback: (err: string | null) => void = null) {
    this._event('willOpenFile', {op: "revertToLastOpened"})
    if ((this.state.openedContent != null) && this.state.metadata) {
      return this._fileOpened(this.state.openedContent, this.state.metadata, {openedContent: this.state.openedContent.clone()})
    }
  }

  revertToLastOpenedDialog(callback: (err: string | null) => void = null) {
    if ((this.state.openedContent != null) && this.state.metadata) {
      return this.confirm(tr('~CONFIRM.REVERT_TO_LAST_OPENED'), () => this.revertToLastOpened(callback))
    } else {
      return (typeof callback === 'function' ? callback('No initial opened version was found for the currently active file') : undefined)
    }
  }

  /**
   * 현재 열려있는 파일을 다른 이름으로 저장합니다.
   */
  exportFile() {
    return this._event('getContent', { shared: this._sharedMetadata() }, (content: any) => {
      const a = document.createElement('a')
      const stringContent = JSON.stringify(content)
      const blob = new Blob([stringContent], {type: 'text/plain'})
      a.href = URL.createObjectURL(blob)
      a.download = `${this.state.metadata?.name || '제목없음'}.codap`
      a.click()
      return URL.revokeObjectURL(a.href)
    })
  }

  saveSecondaryFileAsDialog(stringContent: any, extension: string, mimeType: string, callback: OpenSaveCallback) {
    // set the mimeType if not given with the extension
    const extensionMimeType = mime.getType(extension)
    if (extension && !mimeType && extensionMimeType) {
      mimeType = extensionMimeType
    }

    const provider = this.autoProvider(ECapabilities['export'])
    if (provider) {
      const metadata = { provider, extension, mimeType } as unknown as CloudMetadata
      return this.saveSecondaryFile(stringContent, metadata, callback)
    } else {
      const data = { content: stringContent, extension, mimeType }
      return this._ui.saveSecondaryFileAsDialog(data, (metadata: CloudMetadata) => {
        // replace defaults
        if (extension) {
          metadata.filename = CloudMetadata.newExtension(metadata.filename, extension)
        }
        if (mimeType) {
          metadata.mimeType = mimeType
        }

        return this.saveSecondaryFile(stringContent, metadata, callback)
      })
    }
  }

  // AIDEV-NOTE:
  // 큰 바이너리(이미지 등)를 CODAP 문서에 inline base64로 임베드하지 않고 외부 서버에 업로드한 뒤
  // URL만 문서에 저장하기 위한 공개 API. CODAP가 `DG.cfmClient.uploadBinary(file)` 형태로 호출한다.
  // 내부적으로 기존 ActiveStorage DirectUpload 경로를 그대로 사용한다.
  async uploadBinary(file: File): Promise<string> {
    const { url } = await createBlobAndUrlFromFile(file)
    return url
  }

  // Saves a file to backend, but does not update current metadata.
  // Used e.g. when exporting .csv files from CODAP
  saveSecondaryFile(stringContent: any, metadata: CloudMetadata, callback: OpenSaveCallback = null) {
    if (metadata?.provider?.can(ECapabilities["export"], metadata)) {
      return metadata.provider.saveAsExport(stringContent, metadata, (err: string | null, statusCode?: number) => {
        return err ? this.alert(err) : callback?.(stringContent, metadata)
      })
    }
  }

  dirty(isDirty = true) {
    this._setState({
      dirty: isDirty,
      saved: this.state.saved && !isDirty
    })
    if (window.self !== window.top) {
      // post to parent and not top window (not a bug even though we test for self inst top above)
      return window.parent.postMessage({type: "cfm::setDirty", isDirty}, "*")
    }
  }

  shouldAutoSave() {
    const { metadata } = this.state
    return (
      this.state.dirty
      && !metadata?.autoSaveDisabled
      && !this.isSaveInProgress()
      && metadata?.provider?.can(ECapabilities.resave, metadata)
    )
  }

  autoSave(interval: number) {
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval)
    }

    // in case the caller uses milliseconds
    if (interval > 1000) {
      interval = Math.round(interval / 1000)
    }
    if (interval > 0) {
      return this._autoSaveInterval = window.setInterval(
          () => { if (this.shouldAutoSave()) { return this.save() } },
          interval * 1000
      )
    }
  }

  isAutoSaving() {
    return (this._autoSaveInterval != null)
  }

  changeLanguage(newLangCode: string, callback: (newLangCode?: string) => void) {
    setCurrentLanguage(newLangCode)
    if (callback) {
      const postSave = (err: string | null) => {
        if (err) {
          this.alert(err)
          return this.confirm(tr('~CONFIRM.CHANGE_LANGUAGE'), () => callback(newLangCode))
        } else {
          return callback(newLangCode)
        }
      }
      if (this.state.metadata?.provider?.can(ECapabilities.save)) {
        return this.save((err: string | null) => postSave(err))
      } else {
        return this.saveTempFile(postSave)
      }
    }
  }

  showBlockingModal(modalProps: any) {
    return this._ui.showBlockingModal(modalProps)
  }

  hideBlockingModal() {
    return this._ui.hideBlockingModal()
  }

  getCurrentUrl(hashString?: string) {
    return `${window.location.origin}${window.location.pathname}${window.location.search}${hashString || ""}`
  }

  // Takes an array of strings representing url parameters to be removed from the URL.
  // Removes the specified parameters from the URL and then uses the history API's
  // pushState() method to update the URL without reloading the page.
  // Adapted from http://stackoverflow.com/a/11654436.
  removeQueryParams(params: string[]) {
    let url = window.location.href
    const hash = url.split('#')

    for (let key of params) {
      const re = new RegExp(`([?&])${key}=.*?(&|#|$)(.*)`, "g")

      if (re.test(url)) {
        hash[0] = hash[0].replace(re, '$1$3').replace(/(&|\?)$/, '')
      }
    }

    url = hash[0] + ((hash[1] != null) ? `#${hash[1]}` : '')

    if (url !== window.location.href) {
      return history.pushState({ originalUrl: window.location.href }, '', url)
    }
  }

  confirm(message: any, callback: any, rejectCallback?: any) {
    return this.confirmDialog({ message, callback, rejectCallback })
  }

  confirmDialog(params: any) {
    return this._ui.confirmDialog(params)
  }

  alert(message: string, titleOrCallback?: string | (() => void), callback?: () => void) {
    if (_.isFunction(titleOrCallback)) {
      callback = titleOrCallback
      titleOrCallback = null
    }
    return this._ui.alertDialog(message, ((titleOrCallback as string) || tr("~CLIENT_ERROR.TITLE")), callback)
  }

  hideAlert() {
    this._ui.hideAlertDialog()
  }

  selectInteractiveStateDialog(props: SelectInteractiveStateDialogProps, callback: SelectInteractiveStateCallback): void {
    this._event("requiresUserInteraction")
    this._ui.selectInteractiveStateDialog({...props, onSelect: callback})
  }

  async onUnload(options: IGetInteractiveState) {
    if (options.unloading) {
      return new Promise<{}>(resolve => {
        // only save if the provider is set - when using linked interactives the provider is not set when
        // the linked interactive changed and the version choice dialog is showing
        if (this.state.metadata?.provider) {
          this.save((content, metadata, savedContent) => {
            // providers can save a different format for the content
            // for example the interactiveApi provider can save attachments in which case the savedContent
            // will be an object pointing at the attachment
            resolve(savedContent || content)
          })
        } else {
          // signal that nothing needs to be saved
          resolve(undefined)
        }
      })
    }
    return Promise.resolve(undefined)
  }

  _dialogSave(stringContent: any, metadata: CloudMetadata, callback: OpenSaveCallback) {
    if (stringContent != null) {
      return this.saveFileNoDialog(stringContent, metadata, callback)
    } else {
      return this._event('getContent', { shared: this._sharedMetadata() }, (stringContent: any) => {
        return this.saveFileNoDialog(stringContent, metadata, callback)
      })
    }
  }
  // The purpose of this seems to be to definitely set whether or not the content
  // can be overwritten? Will mutate metadata:
  _updateMetaDataOverwritable(metadata: CloudMetadata) {
    if (metadata != null) {
      metadata.overwritable = (metadata.overwritable != null)
        ? metadata.overwritable
        : true
    }
  }

  _fileChanged(type: CFMFileChangedEventType, content: any, metadata: CloudMetadata, additionalState?: any, hashParams: string = null) {
    if (additionalState == null) { additionalState = {} }

    this._updateMetaDataOverwritable(metadata)
    this._updateState(content, metadata, additionalState, hashParams)
    return this._event(type, { content: (content != null ? content.getClientContent() : undefined), shared: this._sharedMetadata() })
  }

  _fileOpened(content: any, metadata: CloudMetadata, additionalState?: any, hashParams: string = null) {
    if (additionalState == null) { additionalState = {} }
    
    const eventData = {
      // openNewCodapProject라는 플래그가 있으면 content를 비워서 새로운 프로젝트를 열도록 합니다.
      // content가 undefined이면 새로운 프로젝트를 여는 로직이 CODAP 레포지토리에서 처리됩니다.
      content: content?.content?.openNewCodapProject
        ? undefined
        : content?.getClientContent?.() ?? content,
    }
    // update state before sending 'openedFile' events so that 'openedFile' listeners that
    // reference state have the updated state values
    this._updateState(content, metadata, additionalState, hashParams)
    // add metadata contentType to event for CODAP to load via postMessage API (for SageModeler standalone)
    const contentType = metadata.mimeType || metadata.contentType;
    (eventData as any).metadata = {contentType, url: metadata.url, filename: metadata.filename}
    return this._event('openedFile', eventData, (iError: string | null, iSharedMetadata: any) => {
      if (iError) {
        return this.alert(iError, () => this.ready())
      }

      this._updateMetaDataOverwritable(metadata)
      if (!this.appOptions.wrapFileContent) {
        content.addMetadata(iSharedMetadata)
      }
      // and then update state again for the metadata and content changes
      this._updateState(content, metadata, additionalState, hashParams)
      return this.ready()
    })
  }

  _updateState(content: any, metadata: CloudMetadata, additionalState: Partial<IClientState> = {}, hashParams: string = null) {
    const state: Partial<IClientState> = {
      currentContent: content,
      metadata,
      saving: null,
      saved: false,
      dirty: !additionalState.saved && content?.requiresConversion(),
      ...additionalState
    }
    this._setWindowTitle(metadata?.name)
    if (hashParams !== null) {
      window.location.hash = hashParams
    }
    return this._setState(state)
  }

  _event(type: CloudFileManagerEventType, data?: any, eventCallback: ClientEventCallback = null) {
    if (data == null) { data = {} }
    const event = new CloudFileManagerClientEvent(type, data, eventCallback, this.state)
    for (let listener of this._listeners) {
      listener(event)
    }
    // Workaround to fix https://www.pivotaltracker.com/story/show/162392580
    // CODAP will fail on the renamedFile message because we don't send the state with
    // the postMessage events and CODAP examines the state to get the new name.
    // I tried sending the state but that causes CODAP to replace its state which breaks other things.
    // A permanent fix for this would be to send the new filename outside of the state metadata.
    const skipPostMessage = type === "renamedFile"
    if (this.appOptions?.sendPostMessageClientEvents && this.iframe && !skipPostMessage) {
      return event.postMessage(this.iframe.contentWindow)
    }
  }

  _setState(newState: Partial<IClientState>) {
    this.state = { ...this.state, ...newState }
    return this._event('stateChanged')
  }

  _resetState() {
    return this._setState({
      openedContent: null,
      currentContent: null,
      metadata: null,
      dirty: false,
      saving: null,
      saved: false,
      failures: 0
    })
  }

  _closeCurrentFile() {
    const { metadata } = this.state
    if (metadata?.provider?.can(ECapabilities.close, metadata)) {
      return metadata.provider.close(metadata)
    }
  }

  _createOrUpdateCurrentContent(stringContent: any, metadata: CloudMetadata = null) {
    let currentContent: CloudContent
    if (this.state.currentContent != null) {
      ({ currentContent } = this.state)
      currentContent.setText(stringContent)
    } else {
      currentContent = cloudContentFactory.createEnvelopedCloudContent(stringContent)
    }
    if (metadata != null) {
      currentContent.addMetadata({docName: metadata.name})
    }
    return currentContent
  }

  _setWindowTitle(name?: string) {
    if (this.appOptions?.appSetsWindowTitle) {
      return
    }
    const {ui } = this.appOptions
    if(ui) {
      const { windowTitleSeparator, windowTitleSuffix } = ui
      if (windowTitleSuffix) {
          const displayName = (name || "").length > 0
            ? name
            : tr("~MENUBAR.UNTITLED_DOCUMENT")
          document.title = `${displayName}${windowTitleSeparator}${windowTitleSuffix}`
      }
    }
  }

  _getHashParams(metadata: CloudMetadata) {
    const canOpenSaved = metadata?.provider?.canOpenSaved() || false
    let openSavedParams = canOpenSaved ? metadata?.provider?.getOpenSavedParams(metadata) : null
    if (canOpenSaved && (openSavedParams != null) && (typeof openSavedParams === "string")) {
      return `#file=${metadata.provider.urlDisplayName || metadata.provider.name}:${encodeURIComponent(openSavedParams)}`
    } else if (metadata?.provider instanceof URLProvider && (window.location.hash.indexOf("#file=http") === 0)) {
      return window.location.hash    // leave it alone
    } else { return "" }
  }

  _startPostMessageListener() {
    return $(window).on('message', e => {
      const oe = e.originalEvent
      const data = (oe as any).data || {}
      const reply = function(type: any, params: any) {
        if (params == null) { params = {} }
        const message = _.merge({}, params, {type})
        return (oe as any).source.postMessage(message, (oe as any).origin)
      }
      switch (data?.type) {
        case 'cfm::getCommands':
          return reply('cfm::commands', {commands: ['cfm::autosave', 'cfm::event', 'cfm::event:reply', 'cfm::setDirty', 'cfm::iframedClientConnected']})
        case 'cfm::autosave':
          if (this.shouldAutoSave()) {
            return this.save(() => reply('cfm::autosaved', {saved: true}))
          } else {
            return reply('cfm::autosaved', {saved: false})
          }
        case 'cfm::event':
          return this._event(data.eventType, data.eventData, function() {
            const callbackArgs = JSON.stringify(Array.prototype.slice.call(arguments))
            return reply('cfm::event:reply', {eventId: data.eventId, callbackArgs})
        })
        case 'cfm::event:reply': {
          const event = CLOUDFILEMANAGER_EVENTS[data.eventId]
          const callbackData = JSON.parse(data?.callbackArgs || null)
          return event?.callback?.apply(this, callbackData)
        }
        case 'cfm::setDirty':
          return this.dirty(data.isDirty)
        case 'cfm::iframedClientConnected':
          this.connectedPromiseResolver?.resolve()
          return this.processUrlParams()
      }
    })
  }

  _setupConfirmOnClose() {
    return $(window).on('beforeunload', e => {
      if (this.state.dirty) {
        // different browsers trigger the confirm in different ways
        e.preventDefault()
        return (e as any).returnValue = true
      }
    })
  }

  _filterLoadedContent(content: any) {
    return this.appOptions.contentLoadFilter?.(content) || content
  }
}

export {
  CloudFileManagerClientEvent,
  CloudFileManagerClient
}
