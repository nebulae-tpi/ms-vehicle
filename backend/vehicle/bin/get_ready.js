'use strict'

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').load();
}

const mongoDB = require('./data/MongoDB').singleton();
const VehicleDA = require('./data/VehicleDA');
const VehicleBlocksDA = require('./data/VehicleBlocksDA');
const { concat, forkJoin } = require('rxjs');

const start = () => { 
    concat(
        // initializing needed resources
        mongoDB.start$(),
        forkJoin(
            VehicleDA.start$(),
            VehicleBlocksDA.start$(),
        ), 
        // executing maintenance tasks
        mongoDB.createIndexes$(),
        // stoping resources
        mongoDB.stop$(),
    ).subscribe(
        (evt) => console.log(evt),
        (error) => {
            console.error('Failed to get-ready',error);
            process.exit(1);
        },
        () => {
            console.log('vehicle get-ready');
            process.exit(0);
        }
    );
}

start();