/// <reference types="cypress" />
// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

/**
 * @type {Cypress.PluginConfig}
 */
const fs = require('fs-extra');
const path = require('path');
 
function getConfigFile (name) {
   const pathToConfigFile = path.resolve('config', name);
   return fs.readJson(pathToConfigFile)
   // Don't throw an error if config file does not exist. Just return an empty config.
       .catch(_ => {})
}
 
function getEnvVariablesStartingWith (prefix) {
   const result = {};
   Object.keys(process.env).forEach(key => {
       if (key.startsWith(prefix)) {
           const [_, configKey] = key.split(prefix);
           result[configKey] = process.env[key]
       }
   });
   return result
}

module.exports = (on, config) => {
  // Why do we need to read process.env again? Cypress preprocess environment variables. If it finds one with name
  // that matches one of the Cypress config options, it will update the config and remove this entry from environment
  // variables set. It would work fine unless the same option is specified in our own environments.json or user-config.json.
  // In that case, env variable would be lost and overwritten. However, we always do want env variable to be the
  // most important, final value. That's why we read unprocessed process.env variables again and add them back to the set.
  const unifiedCypressEnvVariables = Object.assign(getEnvVariablesStartingWith("CYPRESS_"), config.env);
  const environment = unifiedCypressEnvVariables.testEnv || 'dev';
  // First, read environments.json.
  return getConfigFile('environments.json')
      .then(content => {
          // Pick correct set of values for given environment.
          const envSpecificConfig = content[environment] || {};
          return Object.assign(envSpecificConfig, unifiedCypressEnvVariables)

      })
}

