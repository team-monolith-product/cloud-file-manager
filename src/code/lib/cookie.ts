/**
 * document.cookie에서 name에 해당하는 쿠키 값을 가져옵니다.
 *
 * entry-ts 레포지토리의 코드를 참조하여 작성하였으나, env 환경변수 객체를 사용할 수 없는 환경이므로,
 * 환경 구분을 window.location.hostname을 통해 직접 구분하도록 작성하였습니다.
 *
 * v3 정식 출시 이후 runtime env를 주입 가능하게 된다면
 * COOKIE_ENV를 env.REACT_APP_ENVIRONMENT로 대체할 수 있습니다.
 */

import Cookies from "universal-cookie"

function getEnv(): string {
  const splitedHostNames = window.location.hostname.split(".")
  return splitedHostNames.includes("localhost")
    ? "local"
    : splitedHostNames.includes("dev") ||
      splitedHostNames.includes("revised") ||
      splitedHostNames.includes("ver")
    ? "dev"
    : "prd"
}

function getCookieName(tokenName: string): string {
  if (window.location.hostname === "localhost") {
    return `${tokenName}_localhost_local`
  } else {
    // hostname example: "codap.2v8p.aidt.me"
    const tenant = window.location.hostname.split(".")[1]
    return `${tokenName}_${tenant}_${getEnv()}`
  }
}

export function getCookieDomain(): string {
  if (window.location.hostname === "localhost") {
    // 실제로는 불리지 않는 코드
    return "localhost"
  } else {
    const host = window.location.hostname

    return `.${host.split(".").slice(1).join(".")}`
  }
}

export function getCookieToken(tokenName: string): string | undefined {
  return new Cookies().get(getCookieName(tokenName))
}

export function setCookieToken(tokenName: string, value: string): void {
  if (window.location.hostname === "localhost") {
    new Cookies().set(getCookieName(tokenName), value, { path: "/" })
  } else {
    const domain = getCookieDomain()
    new Cookies().set(getCookieName(tokenName), value, {
      domain: domain,
      path: "/",
    })
  }
}

export function removeCookieToken(tokenName: string): void {
  if (window.location.hostname === "localhost") {
    new Cookies().remove(getCookieName(tokenName), { path: "/" })
  } else {
    const domain = getCookieDomain()
    new Cookies().remove(getCookieName(tokenName), {
      domain: domain,
      path: "/",
    })
  }
}
