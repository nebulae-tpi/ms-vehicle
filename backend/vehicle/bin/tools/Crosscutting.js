'use strict'

const uuidv4 = require("uuid/v4");
const GMT_OFFSET = ((parseInt(process.env.GMT_TO_SERVE.replace('GMT', '') * 60)) + new Date().getTimezoneOffset()) * 60000;

class Crosscutting{

    /**
     * Generates an uuid based on the uuid/v4 library and at the end 
     * of this uuid concatenates the month and the year. 
     * This is useful for cases where the info will be stored in collections by month.
     * 
     * @param {*} date Date with which will be generated the suffix of the uuid.
     */
    static generateHistoricalUuid(date) {
        const dateGMT = new Date(date.getTime() + GMT_OFFSET)
        const sufixUuid = this.getMonthYear(dateGMT);
        const uuId = `${uuidv4()}-${sufixUuid}`;
        return uuId;
    }

    /**
     * Generates a suffix (MMyy) according to the date.
     * Format: MMyy
     * 
     * @example
     * month: 06
     * year: 2018
     * // returns 0618
     * 
     * @param {*} date 
     */
    static getMonthYear(date){
        let month = date.getMonth()+1;
        let year = date.getFullYear() + '';
        month = (month.length == 1 ? '0': '') + month;
        year = year.substr(year.length - 2)

        return `${month}${year}`;
    }

    /**
     * find the day of year of the given date
     * @param {number} date date in millis
     */
    static getDayOfYear(date = Date.now() ){
        const now = new Date(new Date(date).toLocaleString('es-CO', { timeZone: 'America/Bogota' }));
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor( diff / oneDay );
    }

    static getDayOfWeek(date = Date.now()){
        const now = new Date(new Date(date).toLocaleString('es-CO', { timeZone: 'America/Bogota' }));
        return now.getDay();
    }

}

/**
 * @returns {Crosscutting}
 */
module.exports = Crosscutting;