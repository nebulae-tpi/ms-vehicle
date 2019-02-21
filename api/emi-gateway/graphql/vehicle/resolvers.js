const withFilter = require("graphql-subscriptions").withFilter;
const PubSub = require("graphql-subscriptions").PubSub;
const pubsub = new PubSub();
const { of } = require("rxjs");
const { map, mergeMap, catchError } = require('rxjs/operators');
const broker = require("../../broker/BrokerFactory")();
const RoleValidator = require('../../tools/RoleValidator');
const { handleError$ } = require('../../tools/GraphqlResponseTools');

const INTERNAL_SERVER_ERROR_CODE = 1;
const PERMISSION_DENIED_ERROR_CODE = 2;

function getResponseFromBackEnd$(response) {
    return of(response)
        .pipe(
            map(resp => {
                if (resp.result.code != 200) {
                    const err = new Error();
                    err.name = 'Error';
                    err.message = resp.result.error;
                    // this[Symbol()] = resp.result.error;
                    Error.captureStackTrace(err, 'Error');
                    throw err;
                }
                return resp.data;
            })
        );
}


module.exports = {

    //// QUERY ///////


    Query: {
        VehicleVehicles(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                'ms-' + 'Vehicle', 'VehicleVehicles',
                PERMISSION_DENIED_ERROR_CODE,
                'Permission denied', ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR" ]
            )
                .pipe(
                    mergeMap(() =>
                        broker
                            .forwardAndGetReply$(
                                "Vehicle",
                                "emigateway.graphql.query.VehicleVehicles",
                                { root, args, jwt: context.encodedToken },
                                2000
                            )
                    ),
                    catchError(err => handleError$(err, "VehicleVehicles")),
                    mergeMap(response => getResponseFromBackEnd$(response))
                ).toPromise();
        },
        VehicleVehiclesSize(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                'ms-Vehicle', 'VehicleVehiclesSize',
                PERMISSION_DENIED_ERROR_CODE,
                'Permission denied', ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            )
                .pipe(
                    mergeMap(() =>
                        broker
                            .forwardAndGetReply$(
                                "Vehicle",
                                "emigateway.graphql.query.VehicleVehiclesSize", { root, args, jwt: context.encodedToken },
                                2000
                            )
                    ),
                    catchError(err => handleError$(err, "VehicleVehiclesSize")),
                    mergeMap(response => getResponseFromBackEnd$(response))
                ).toPromise();
        },
        VehicleVehicle(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                'ms-Vehicle', 'VehicleVehicle',
                PERMISSION_DENIED_ERROR_CODE,
                'Permission denied',
                ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            )
                .pipe(
                    mergeMap(() =>
                        broker
                            .forwardAndGetReply$(
                                "Vehicle",
                                "emigateway.graphql.query.VehicleVehicle", { root, args, jwt: context.encodedToken },
                                2000
                            )
                    ),
                    catchError(err => handleError$(err, "VehicleVehicle")),
                    mergeMap(response => getResponseFromBackEnd$(response))
                ).toPromise();
        },
        VehicleVehicleBlocks(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                'ms-Vehicle', 'VehicleVehicleBlocks',
                PERMISSION_DENIED_ERROR_CODE,
                'Permission denied',
                ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            )
                .pipe(
                    mergeMap(() =>
                        broker
                            .forwardAndGetReply$(
                                "Vehicle",
                                "emigateway.graphql.query.vehicleVehicleBlocks",
                                { root, args, jwt: context.encodedToken },
                                2000
                            )
                    ),
                    catchError(err => handleError$(err, "VehicleVehicle")),
                    mergeMap(response => getResponseFromBackEnd$(response))
                ).toPromise();
        },
    },
    //// MUTATIONS ///////
    Mutation: {
        VehicleCreateVehicle(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                "Vehicle",
                "VehicleCreateVehicle",
                PERMISSION_DENIED_ERROR_CODE,
                "Permission denied",
                ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            )
                .pipe(
                    mergeMap(() =>
                        context.broker.forwardAndGetReply$(
                            "Vehicle",
                            "emigateway.graphql.mutation.VehicleCreateVehicle",
                            { root, args, jwt: context.encodedToken },
                            2000
                        )
                    ),
                    catchError(err => handleError$(err, "VehicleCreateVehicle")),
                    mergeMap(response => getResponseFromBackEnd$(response))
                ).toPromise();
        },
        VehicleUpdateVehicleGeneralInfo(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                "Vehicle",
                "VehicleUpdateVehicleGeneralInfo",
                PERMISSION_DENIED_ERROR_CODE,
                "Permission denied",
                ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            ).pipe(
                mergeMap(() =>
                    context.broker.forwardAndGetReply$(
                        "Vehicle",
                        "emigateway.graphql.mutation.VehicleUpdateVehicleGeneralInfo",
                        { root, args, jwt: context.encodedToken },
                        2000
                    )
                ),
                catchError(err => handleError$(err, "updateVehicleGeneralInfo")),
                mergeMap(response => getResponseFromBackEnd$(response))
            ).toPromise();
        },
        VehicleUpdateVehicleState(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                "Vehicle",
                "VehicleUpdateVehicleState",
                PERMISSION_DENIED_ERROR_CODE,
                "Permission denied",
                ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            ).pipe(
                mergeMap(() =>
                    context.broker.forwardAndGetReply$(
                        "Vehicle",
                        "emigateway.graphql.mutation.VehicleUpdateVehicleState",
                        { root, args, jwt: context.encodedToken },
                        2000
                    )
                ),
                catchError(err => handleError$(err, "updateVehicleState")),
                mergeMap(response => getResponseFromBackEnd$(response))
            ).toPromise();
        },
        VehicleAddVehicleBlocking(root, args, context) {
            // TODO:  missing resolvers in backend
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                "Vehicle",
                "VehicleAddVehicleBlocking",
                PERMISSION_DENIED_ERROR_CODE,
                "Permission denied",
                ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            ).pipe(
                mergeMap(() =>
                    context.broker.forwardAndGetReply$(
                        "Vehicle",
                        "emigateway.graphql.mutation.VehicleAddVehicleBlocking",
                        { root, args, jwt: context.encodedToken },
                        2000
                    )
                ),
                catchError(err => handleError$(err, "addBlocking")),
                mergeMap(response => getResponseFromBackEnd$(response))
            ).toPromise();
        },
        VehicleRemoveVehicleBlocking(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                "Vehicle",
                "VehicleRemoveVehicleBlocking",
                PERMISSION_DENIED_ERROR_CODE,
                "Permission denied",
                ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            ).pipe(
                mergeMap(() =>
                    context.broker.forwardAndGetReply$(
                        "Vehicle",
                        "emigateway.graphql.mutation.vehicleRemoveVehicleBlocking",
                        { root, args, jwt: context.encodedToken },
                        2000
                    )
                ),
                catchError(err => handleError$(err, "removeBlocking")),
                mergeMap(response => getResponseFromBackEnd$(response))
            ).toPromise();
        },
        VehicleUpdateVehicleFeatures(root, args, context) {
            return RoleValidator.checkPermissions$(
                context.authToken.realm_access.roles,
                "Vehicle",
                "VehicleUpdateVehicleFeatures",
                PERMISSION_DENIED_ERROR_CODE,
                "Permission denied", ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR"]
            ).pipe(
                mergeMap(() =>
                    context.broker.forwardAndGetReply$(
                        "Vehicle",
                        "emigateway.graphql.mutation.vehicleUpdateVehicleFeatures", { root, args, jwt: context.encodedToken },
                        2000
                    )
                ),
                catchError(err => handleError$(err, "updateFeatures")),
                mergeMap(response => getResponseFromBackEnd$(response))
            ).toPromise();
        },
    },
        

    //// SUBSCRIPTIONS ///////
    Subscription: {
        VehicleVehicleUpdatedSubscription: {
            subscribe: withFilter(
                (payload, variables, context, info) => {
                    return pubsub.asyncIterator("VehicleVehicleUpdatedSubscription");
                },
                (payload, variables, context, info) => {
                    return true;
                }
            )
        },
        VehicleLocationUpdatedSubscription: {
            subscribe: withFilter(
                (payload, variables, context, info) => {
                    return pubsub.asyncIterator("VehicleVehicleUpdatedSubscription");
                },
                (payload, variables, context, info) => {
                    return true;
                }
            )
        },
    }
    
};

//// SUBSCRIPTIONS SOURCES ////

const eventDescriptors = [{
        backendEventName: 'VehicleVehicleUpdatedSubscription',
        gqlSubscriptionName: 'VehicleVehicleUpdatedSubscription',
        dataExtractor: (evt) => evt.data, // OPTIONAL, only use if needed
        onError: (error, descriptor) => console.log(`Error processing ${descriptor.backendEventName}`), // OPTIONAL, only use if needed
        onEvent: (evt, descriptor) => console.log(`Event of type  ${descriptor.backendEventName} arraived`), // OPTIONAL, only use if needed
    },
    {
        backendEventName: 'VehicleLocationUpdated',
        gqlSubscriptionName: 'VehicleLocationUpdatedSubscription'
    },
];



/**
 * Connects every backend event to the right GQL subscription
 */
eventDescriptors.forEach(descriptor => {
    broker
        .getMaterializedViewsUpdates$([descriptor.backendEventName])
        .subscribe(
            evt => {
                if (descriptor.onEvent) {
                    descriptor.onEvent(evt, descriptor);
                }
                const payload = {};
                payload[descriptor.gqlSubscriptionName] = descriptor.dataExtractor ? descriptor.dataExtractor(evt) : evt.data
                pubsub.publish(descriptor.gqlSubscriptionName, payload);
            },

            error => {
                if (descriptor.onError) {
                    descriptor.onError(error, descriptor);
                }
                console.error(
                    `Error listening ${descriptor.gqlSubscriptionName}`,
                    error
                );
            },

            () =>
            console.log(
                `${descriptor.gqlSubscriptionName} listener STOPPED`
            )
        );
});