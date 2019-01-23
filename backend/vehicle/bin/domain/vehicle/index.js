"use strict";

const VehicleCQRS = require("./VehicleCQRS")();
const VehicleES = require("./VehicleES")();

module.exports = {
  /**
   * @returns {VehicleCQRS}
   */
  VehicleCQRS,
  /**
   * @returns {VehicleES}
   */
  VehicleES
};
