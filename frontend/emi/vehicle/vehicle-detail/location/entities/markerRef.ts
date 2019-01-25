
import { Subject } from 'rxjs';
// <reference types="googlemaps" />

import { MapRef } from './agmMapRef';

export const MARKER_REF_ORIGINAL_INFO_WINDOW_CONTENT = `<html>
    <body>
        <div id="deviceInfoWindow">
        <h2>$$POS_DETAILS$$</h2>
        <p> <strong>$$POS_ID$$: </strong>{POS_ID}</p>
        <!-- <p> <strong>$$BUSINESS_ID$$: </strong>{BUSINESS_ID}</p> -->
        <p> <strong>$$BUSINESS_NAME$$: </strong>{BUSINESS_NAME}</p>
        <p> <strong>$$USER_NAME$$: </strong>{USER_NAME}</p>
        <p> <strong>$$LAST_UPDATE$$: </strong>{LAST_UPDATE}</p>
      </div>
    </body>
  </html>
  `;


export class VehiclePoint {
  _id: string;
  lastUpdate: number;
  businessId: string;
  businessName: string;
  location: { type: string, coordinates: { lat: number, long: number } };
  constructor(
    _id: string,
    lastUpdate: number,
    businessId: string,
    businessName: string,
    location: { type: string, coordinates: { lat: number, long: number } }){
      this._id = _id;
      this.lastUpdate = lastUpdate;
      this.businessId =  businessId;
      this.businessName = businessName;
      this.location = location;
  }
}

export class LocationPath {
  lat: number;
  lng: number;
  timestamp: number;
}

export class MarkerRef extends google.maps.Marker {
  animation_changedEvent = new  Subject();
  clickEvent = new Subject<google.maps.MouseEvent>();
  clickable_changedEvent = new Subject();
  cursor_changedEvent = new Subject();
  dblclickEvent = new Subject();
  dragEvent = new Subject();
  dragendEvent = new Subject();
  draggable_changedEvent = new Subject();
  dragstartEvent = new Subject();
  flat_changedEvent = new Subject();
  icon_changedEvent = new Subject();
  mousedownEvent = new Subject();
  mouseoutEvent = new Subject();
  mouseoverEvent = new Subject();
  mouseupEvent = new Subject();
  position_changedEvent = new Subject();
  rightclickEvent = new Subject();
  shape_changedEvent = new Subject();
  title_changedEvent = new Subject();
  visible_changedEvent = new Subject();
  zindex_changedEvent = new Subject();

  contentString = MARKER_REF_ORIGINAL_INFO_WINDOW_CONTENT;

  infoWindow = new google.maps.InfoWindow({
    content: this.contentString
  });

  /**
   * Historical route path of the vehicle
   */
  routePath: google.maps.Polyline;
  vehiclePoint: VehiclePoint = null;
  lastTimeLocationReported = null;
  index = 0;
  deltaLat = 0;
  deltaLng = 0;
  lastLat = 0;
  lastLng = 0;
  numDeltas = 80;
  delay = 10;
  iconUrl;
  lastLocationPath: [LocationPath];
  allMap: MapRef;

  constructor(vehiclePoint: VehiclePoint, opts?: google.maps.MarkerOptions) {
    super(opts);
    // const icon = {
    //   url: "./assets/devices-location/bus.svg",
    //   anchor: new google.maps.Point(30, 30),
    //   scaledSize: new google.maps.Size(30, 30)
    // };
    this.setClickable(true);
    this.setLabel(' ');
    // this.setTitle('D-HUB');
    this.setDraggable(false);
    // this.setIcon('./assets/devices-location/tpm_bus_30_30.png');
    // this.setIcon(icon);
    this.vehiclePoint = vehiclePoint;
    this.lastTimeLocationReported = 0;
    this.updateIcon();
  }

  /**
   * Updates the marker icon according to the vehicle states (Online, Alarmed, Offline)
   */

  updateIcon() {
    // const newIconUrl = './assets/coverage-reports/pos_02.png';

    // if (
    //   ( this.vehicle.online ) {
    //   newIconUrl = './assets/devices-location/busAlarmed.svg';
    // } else if (this.vehicle.online) {
    //   newIconUrl = './assets/devices-location/busOnline.svg';
    // } else {
    //   newIconUrl = './assets/devices-location/busOffline.svg';
    // }

    // console.log(" Icon: ", newIconUrl, (newIconUrl != this.iconUrl), " Vehicle: ", this.vehicle);

    // if(this.iconUrl == "./assets/devices-location/busOnline.svg"){
    //   newIconUrl = "./assets/devices-location/busOffline.svg";
    // }else if(this.iconUrl == "./assets/devices-location/busOffline.svg"){
    //   newIconUrl = "./assets/devices-location/busAlarmed.svg";
    // }else if(this.iconUrl == "./assets/devices-location/busAlarmed.svg"){
    //   newIconUrl = "./assets/devices-location/busOnline.svg";
    // }

    // We only upodate the icon if it had changed.
    // if (newIconUrl !== this.iconUrl) {
    //   this.iconUrl = newIconUrl;
    //   const icon = {
    //     url: newIconUrl,
    //     anchor: new google.maps.Point(40, 40),
    //     scaledSize: new google.maps.Size(40, 40)
    //   };
    //   this.setIcon(icon);
    // }
  }

  updateData( lng: number, lat: number, delay: number, timeLocationReported: number, online: Boolean,
    center = false, showDisconnectedDevices = true) {

    this.setVisibility(100);
    this.index = 0;

    this.deltaLat = (lat - this.getPosition().lat()) / this.numDeltas;
    this.deltaLng = (lng - this.getPosition().lng()) / this.numDeltas;
    this.lastLat = lat;
    this.lastLng = lng;

    if (!online && !showDisconnectedDevices) {
      this.setVisible(showDisconnectedDevices);
    }

    this.updateIcon();
    this.moveMarkerSmoothly(timeLocationReported, false);
  }

  /**
   *
   * @param timeLocationReported
   * @param center
   * @param initCallBack
   * @param endCallBack
   */
  moveMarkerSmoothly(
    timeLocationReported: number,
    center = false,
    initCallBack?,
    endCallBack?
  ) {
    // The marker only can be moved if the time of the new location is greater than the time of the last location reported
    if (this.lastTimeLocationReported < timeLocationReported) {
      if (initCallBack) {
        initCallBack(this);
      }

      this.lastTimeLocationReported = timeLocationReported;
      this.moveMarker(center, endCallBack);
    }
  }

  putMap(map: MapRef) {
    this.allMap = map;
  }

  changeRoutePathVisibility(visible: boolean) {
    this.routePath.setVisible(visible);
  }

  /**
   * Updates the location path of the marker (polyline)
   * @param locationPath
   */
  updateRoutePath(map, locationPath?: [LocationPath]) {
    if (!locationPath && locationPath.length < 1) {
      return;
    }

    if (this.routePath) {
      if (this.lastLocationPath && this.lastLocationPath.length > 0) {
        if (this.lastLocationPath[0].timestamp > locationPath[0].timestamp) {
          // It means that the location path received is older, therefore, we cannot take this new location path.
          return;
        }
      }

      this.lastLocationPath = locationPath;
      this.routePath.setMap(null);
    }

    const routePathCoordinates = [];

    for (let i = 0; i < locationPath.length; i++) {
      routePathCoordinates.push({
        lat: locationPath[i].lat,
        lng: locationPath[i].lng
      });
    }

    this.routePath = new google.maps.Polyline({
      path: routePathCoordinates,
      geodesic: true,
      strokeColor: '#FF0000',
      strokeOpacity: 1.0,
      strokeWeight: 2
    });

    this.routePath.setMap(map);
  }

  moveMarker(center = false, endCallBack?) {
    const lat = this.getPosition().lat() + this.deltaLat;
    const lng = this.getPosition().lng() + this.deltaLng;
    this.setPosition(new google.maps.LatLng(lat, lng));

    if (this.allMap) {
      this.allMap.setCenter(this.getPosition());
    }

    if (this.index !== this.numDeltas) {
      this.index++;
      setTimeout(this.moveMarker.bind(this), this.delay);
    } else {
      const _lat = this.lastLat;
      const _lng = this.lastLng;
      this.setPosition(new google.maps.LatLng(_lat, _lng));
      if (this.allMap) {
        this.allMap.setCenter(this.getPosition());
      }

      if (endCallBack) {
        endCallBack(this);
      }
    }
  }

  setVisibility(visibility: number): void {
    this.setOpacity(visibility / 100);
  }

  setTitleMarker(title: string): void {
    this.setTitle(title);
  }

  inizialiteEvents() {
    this.addListener('click', (e: google.maps.MouseEvent) => {
      this.clickEvent.next(e);
    });
    this.addListener('dblclick', e => {
      this.dblclickEvent.next(e);
    });
    // this.addListener('dragend', (e) => { this.dragendEvent.next(e); });
    // this.addListener('position_changed', (e) => { this.position_changedEvent.next(e); });
  }
}


