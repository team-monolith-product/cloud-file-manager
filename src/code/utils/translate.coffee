urlParams = require './url-params'

languageFiles = [
  {key: 'de',    contents: require './lang/de'}      # German
  {key: 'el',    contents: require './lang/el'}      # Greek
  {key: 'en-US', contents: require './lang/en-US'}   # US English
  {key: 'es',    contents: require './lang/es'}      # Spanish
  {key: 'he',    contents: require './lang/he'}      # Hebrew
  {key: 'nb',    contents: require './lang/nb.json'} # Norwegian Bokmål
  {key: 'nn',    contents: require './lang/nn.json'} # Norwegian Nynorsk
  {key: 'tr',    contents: require './lang/tr'}      # Turkish
  {key: 'zh-TW', contents: require './lang/zh-TW'}   # Chinese (Taiwan)
]

# returns baseLANG from baseLANG-REGION if REGION exists
getBaseLanguage = (langKey) ->
  dashLoc = langKey.indexOf('-')
  return langKey.substring(0, dashLoc) if dashLoc isnt -1
  undefined

getFirstBrowserLanguage = ->
  nav = window.navigator
  languages = if nav then (nav.languages or []).concat([nav.language, nav.browserLanguage, nav.systemLanguage, nav.userLanguage]) else []
  for language in languages
    return language if language
  undefined

translations =  {}
languageFiles.forEach (lang) ->
  translations[lang.key] = lang.contents
  # accept full key with region code or just the language code
  baseLang = getBaseLanguage(lang.key)
  translations[baseLang] = lang.contents if baseLang

lang = urlParams.lang or getFirstBrowserLanguage()
baseLang = getBaseLanguage(lang or '')
defaultLang = if lang and translations[lang] then lang else if baseLang and translations[baseLang] then baseLang else "en"

varRegExp = /%\{\s*([^}\s]*)\s*\}/g

translate = (key, vars={}, lang=defaultLang) ->
  translation = translations[lang]?[key]
  translation = key if not translation?
  translation.replace varRegExp, (match, key) ->
    if vars.hasOwnProperty key then vars[key] else "'** UKNOWN KEY: #{key} **"

module.exports = translate
