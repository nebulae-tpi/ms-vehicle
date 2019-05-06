//Every single error code
// please use the prefix assigned to this micorservice
const INTERNAL_SERVER_ERROR_CODE = 00001;
const PERMISSION_DENIED = 00002;
const LICENSE_PLATE_ALREADY_USED = {code: 22010, description: 'Vehicle license plate already used'};

/**
 * class to emcapsulute diferent errors.
 */
class CustomError extends Error {
    constructor(name, method, code = INTERNAL_SERVER_ERROR_CODE , message = '') {
      super(message); 
      this.code = code;
      this.name = name;
      this.method = method;
    }
  
    getContent(){
      return {
        name: this.name,
        code: this.code,
        msg: this.message,      
        method: this.method,
        // stack: this.stack
      }
    }
  };

  class DefaultError extends Error{
    constructor(anyError){
      super(anyError.message)
      this.code = INTERNAL_SERVER_ERROR_CODE;
      this.name = anyError.name;
      this.msg = anyError.message;
      // this.stack = anyError.stack;
    }

    getContent(){
      return{
        code: this.code,
        name: this.name,
        msg: this.msg
      }
    }
  }

  module.exports =  { 
    CustomError,
    DefaultError,
    INTERNAL_SERVER_ERROR_CODE,
    PERMISSION_DENIED,
    LICENSE_PLATE_ALREADY_USED,
    VEHICLE_NO_FOUND: { code: 22011, description: 'Vehicle no found' },
    TRIAL_DENIED: { code: 22012, description: 'Trial subscription denied' }
  } 