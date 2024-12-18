import { includeAndConvert } from "../lib/jsonapi"
import { CodapActivity } from "../models/activitiable"
import { fetchClassRails, snakeCaseInclude } from "./base"

export async function getCodapActivity<T extends "" | "activity" = "">(args: {
  id: string
  includeActivity?: T
}): Promise<CodapActivity<T>> {
  const { id, includeActivity } = args

  const params = new URLSearchParams()
  if (includeActivity) {
    params.append("include", snakeCaseInclude(includeActivity))
  }

  const response = await fetchClassRails(
    `/api/v1/codap_activities/${id}?${params.toString()}`
  )
  const jsonResponse = await response.json()
  return includeAndConvert(jsonResponse.data, jsonResponse.included)
}

export async function updateCodapActivity(
  codapActivity: Pick<CodapActivity, "id">,
  blobId?: string
): Promise<CodapActivity> {
  const response = await fetchClassRails(
    `/api/v1/codap_activities/${codapActivity.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "codap_activity",
          attributes: {
            blob_id: blobId,
          },
        },
      }),
    }
  )
  const jsonResponse = await response.json()
  return includeAndConvert(jsonResponse.data, jsonResponse.included)
}
