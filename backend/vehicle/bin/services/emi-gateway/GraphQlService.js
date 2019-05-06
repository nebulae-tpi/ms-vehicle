"use strict";

const { VehicleCQRS } = require("../../domain/vehicle");
const broker = require("../../tools/broker/BrokerFactory")();
const { of, from } = require("rxjs");
const jsonwebtoken = require("jsonwebtoken");
const { map, mergeMap, catchError, tap } = require('rxjs/operators');
const jwtPublicKey = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n");
const {handleError$} = require('../../tools/GraphqlResponseTools');


let instance;

class GraphQlService {


  constructor() {
    this.functionMap = this.generateFunctionMap();
    this.subscriptions = [];
  }

  /**
   * Starts GraphQL actions listener
   */
  start$() {
      //default on error handler
      const onErrorHandler = (error) => {
        console.error("Error handling  GraphQl incoming event", error);
        process.exit(1);
      };
  
      //default onComplete handler
      const onCompleteHandler = () => {
        () => console.log("GraphQlService incoming event subscription completed");
      };
    return from(this.getSubscriptionDescriptors()).pipe(
      map(aggregateEvent => ({ ...aggregateEvent, onErrorHandler, onCompleteHandler })),
      map(params => this.subscribeEventHandler(params))
    )
  }

  /**
   * build a Broker listener to handle GraphQL requests procesor
   * @param {*} descriptor 
   */
  subscribeEventHandler({
    aggregateType,
    messageType,
    onErrorHandler,
    onCompleteHandler
  }) {
    const handler = this.functionMap[messageType];
    const subscription = broker
      .getMessageListener$([aggregateType], [messageType]).pipe(
        mergeMap(message => this.verifyRequest$(message)),
        mergeMap(request => ( request.failedValidations.length > 0)
          ? of(request.errorResponse)
          : of(request).pipe(
              //ROUTE MESSAGE TO RESOLVER
              mergeMap(({ authToken, message }) =>
              handler.fn
                .call(handler.obj, message.data, authToken).pipe(
                  map(response => ({ response, correlationId: message.id, replyTo: message.attributes.replyTo }))
                )
            )
          )
        )    
        ,mergeMap(msg => this.sendResponseBack$(msg))
      )
      .subscribe(
        msg => { /* console.log(`GraphQlService: ${messageType} process: ${msg}`); */ },
        onErrorHandler,
        onCompleteHandler
      );
    this.subscriptions.push({
      aggregateType,
      messageType,
      handlerName: handler.fn.name,
      subscription
    });
    return {
      aggregateType,
      messageType,
      handlerName: `${handler.obj.name}.${handler.fn.name}`
    };
  }

    /**
   * Verify the message if the request is valid.
   * @param {any} request request message
   * @returns { Rx.Observable< []{request: any, failedValidations: [] }>}  Observable object that containg the original request and the failed validations
   */
  verifyRequest$(request) {
    return of(request).pipe(
      //decode and verify the jwt token
      mergeMap(message =>
        of(message).pipe(
          map(message => ({ authToken: jsonwebtoken.verify(message.data.jwt, jwtPublicKey), message, failedValidations: [] })),
          catchError(err =>
            handleError$(err).pipe(
              map(response => ({
                errorResponse: { response, correlationId: message.id, replyTo: message.attributes.replyTo },
                failedValidations: ['JWT']
              }
              ))
            )
          )
        )
      )
    )
  }

 /**
  * 
  * @param {any} msg Object with data necessary  to send response
  */
 sendResponseBack$(msg) {
   return of(msg).pipe(mergeMap(
    ({ response, correlationId, replyTo }) =>
      replyTo
        ? broker.send$(replyTo, "emigateway.graphql.Query.response", response, {
            correlationId
          })
        : of(undefined)
  ));
}

  stop$() {
    from(this.subscriptions).pipe(
      map(subscription => {
        subscription.subscription.unsubscribe();
        return `Unsubscribed: aggregateType=${aggregateType}, eventType=${eventType}, handlerName=${handlerName}`;
      })
    );
  }

  ////////////////////////////////////////////////////////////////////////////////////////
  /////////////////// CONFIG SECTION, ASSOC EVENTS AND PROCESSORS BELOW  /////////////////
  ////////////////////////////////////////////////////////////////////////////////////////


  /**
   * returns an array of broker subscriptions for listening to GraphQL requests
   */
  getSubscriptionDescriptors() {
    console.log("GraphQl Service starting ...");
    return [
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.query.VehicleVehicles"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.query.VehicleVehiclesSize"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.query.VehicleVehicle"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.mutation.VehicleCreateVehicle"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.mutation.VehicleUpdateVehicleGeneralInfo"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.mutation.VehicleUpdateVehicleState"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.mutation.vehicleUpdateVehicleFeatures"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.query.vehicleVehicleBlocks"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.mutation.vehicleRemoveVehicleBlocking"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.mutation.vehicleAddVehicleBlock"
      },
      {
        aggregateType: "Vehicle",
        messageType: "emigateway.graphql.mutation.applyFreeTrialSubscription"
      },
      // DRIVER GATEWAY
      {
        aggregateType: "Vehicle",
        messageType: "drivergateway.graphql.query.vehicleMembershipExpiration"
      }
    ];
  }


  /**
   * returns a map that assocs GraphQL request with its processor
   */
  generateFunctionMap() {    
    return {
      // EMI GATEWAY
      "emigateway.graphql.query.VehicleVehicles": {
        fn: VehicleCQRS.getVehicleList$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.query.VehicleVehiclesSize": {
        fn: VehicleCQRS.getVehicleListSize$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.query.VehicleVehicle": {
        fn: VehicleCQRS.getVehicle$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.mutation.VehicleCreateVehicle": {
        fn: VehicleCQRS.createVehicle$,
        obj: VehicleCQRS
      }, 
      "emigateway.graphql.mutation.VehicleUpdateVehicleGeneralInfo": {
        fn: VehicleCQRS.updateVehicleGeneralInfo$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.mutation.VehicleUpdateVehicleState": {
        fn: VehicleCQRS.updateVehicleState$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.mutation.vehicleUpdateVehicleFeatures": {
        fn: VehicleCQRS.updateVehicleFeatures$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.query.vehicleVehicleBlocks": {
        fn: VehicleCQRS.getVehicleBlocks$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.mutation.vehicleRemoveVehicleBlocking": {
        fn: VehicleCQRS.removeVehicleBlock$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.mutation.vehicleAddVehicleBlock": {
        fn: VehicleCQRS.addVehicleBlock$,
        obj: VehicleCQRS
      },
      "emigateway.graphql.mutation.applyFreeTrialSubscription":{
        fn: VehicleCQRS.applyFreeTrialSubscription$,
        obj: VehicleCQRS
      },
      // DRIVER GATEWAY
      "drivergateway.graphql.query.vehicleMembershipExpiration": {
        fn: VehicleCQRS.vehicleMembershipExpiration$,
        obj: VehicleCQRS
      },
    };
  }
}

/**
 * @returns {GraphQlService}
 */
module.exports = () => {
  if (!instance) {
    instance = new GraphQlService();
    console.log(`${instance.constructor.name} Singleton created`);
  }
  return instance;
};
