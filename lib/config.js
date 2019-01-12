

/*
*Create and Export configuration variables
*
*/


// Container for all of the environments

let environments = {};

// Staging (default) environment.
environments.staging = {
  'httpPort': 3000,
  'httpsPort': 3001,
  'envName': 'staging',
  'hashingSecret': 'thisIsASecret',
  'maxChecks': 5,
  'twilio': {
    'accountSid': 'AC7b744af889a7ed78b4032eaaa78f4daf',
    'authToken': '8cd5e8780f9853e61397579f1253de61',
    'fromPhone': '2562426752'
  }
};


//Production environment.
environments.production = {
  'httpPort': 5000,
  'httpsPort': 5001,
  'envName': 'production',
  'hashingSecret': 'thisIsASecret',
  'maxChecks': 5,
  'twilio': {
    'accountSid': 'AC7b744af889a7ed78b4032eaaa78f4daf',
    'authToken': '8cd5e8780f9853e61397579f1253de61',
    'fromPhone': '2562426752'
  }
};

// Determine which environment was passed as a command-line argument.

let currentEnvironment = typeof (process.env.NODE_ENV) === 'string' ? process.env.NODE_ENV.toLowerCase() : '';

// Check that the current env is one of the envs above, if not, default to staging.

let environmentToExport = typeof (environments[currentEnvironment]) === 'object' ? environments[currentEnvironment] : environments.staging;

// Export the Module
module.exports = environmentToExport;