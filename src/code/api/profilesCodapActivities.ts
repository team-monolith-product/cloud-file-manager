import { includeAndConvert } from "../lib/jsonapi"
import { ProfilesCodapActivity } from "../models/profilesActivitiable"
import { fetchClassRails, snakeCaseInclude } from "./base"

export async function getProfilesCodapActivity<
  T extends
    | ""
    | "profilesActivity.classroomsActivity.activity"
    | "profilesActivity.classroomsActivity.activity.activitiable" = ""
>(args: {
  id: string
  includeProfilesActivity?: T
}): Promise<ProfilesCodapActivity<T>> {
  const { id, includeProfilesActivity } = args

  const params = new URLSearchParams()
  if (includeProfilesActivity) {
    params.append("include", snakeCaseInclude(includeProfilesActivity))
  }

  const response = await fetchClassRails(
    `/api/v1/profiles_codap_activities/${id}?${params.toString()}`
  )
  const jsonResponse = await response.json()
  return includeAndConvert(jsonResponse.data, jsonResponse.included)
}

export async function updateProfilesCodapActivity(
  profilesCodapActivity: Pick<ProfilesCodapActivity, "id">,
  blobId?: string
): Promise<ProfilesCodapActivity> {
  const response = await fetchClassRails(
    `/api/v1/profiles_codap_activities/${profilesCodapActivity.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "profiles_codap_activity",
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
