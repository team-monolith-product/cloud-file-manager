/**
 * main-react 레포지토리의 코드를 가져오고, token 관련 코드를 수정했습니다.
 */

import { DirectUpload, Blob } from "@rails/activestorage"
import { getClassRailsUrl } from "../lib/getServiceUrl"
import { getCookieToken } from "../lib/cookie"

export async function createBlobAndUrlFromFile(file: File): Promise<{
  blob: Blob
  url: string
}> {
  const upload = new DirectUpload(
    file,
    `${getClassRailsUrl()}/api/v1/direct_uploads`,
    {
      directUploadWillCreateBlobWithXHR: (request) => {
        request.setRequestHeader(
          "Authorization",
          `Bearer ${getCookieToken("token")}`
        )
      },
    }
  )
  return new Promise((resolve, reject) => {
    upload.create((error: Error | null, blob) => {
      if (error) {
        reject(error)
      } else {
        resolve({
          blob,
          url: `${getClassRailsUrl()}/rails/active_storage/blobs/redirect/${
            blob.signed_id
          }/${blob.filename}`,
        })
      }
    })
  })
}
