'use strict'

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').load();
}

const eventSourcing = require('./tools/EventSourcing')();
const eventStoreService = require('./services/event-store/EventStoreService')();
const mongoDB = require('./data/MongoDB').singleton();
const VehicleDA = require('./data/VehicleDA');
const VehicleBlocksDA = require('./data/VehicleBlocksDA');
const graphQlService = require('./services/emi-gateway/GraphQlService')();
const Rx = require('rxjs');

const start = () => {
    Rx.concat(
        eventSourcing.eventStore.start$(),
        eventStoreService.start$(),
        mongoDB.start$(),
        VehicleDA.start$(),
        VehicleBlocksDA.start$(),
        graphQlService.start$()
    ).subscribe(
        (evt) => {
            // console.log(evt)
        },
        (error) => {
            console.error('Failed to start', error);
            process.exit(1);
        },
        () => console.log('vehicle started')
    );
};


start();



