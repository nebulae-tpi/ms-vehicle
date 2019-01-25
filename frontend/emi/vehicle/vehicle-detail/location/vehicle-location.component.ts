import { TranslateService } from '@ngx-translate/core';
import { KeycloakService } from 'keycloak-angular';
import { FuseTranslationLoaderService } from '../../../../../core/services/translation-loader.service';
import { Component, OnDestroy, OnInit, ViewChild, Input } from '@angular/core';
import { fuseAnimations } from '../../../../../core/animations';
import { locale as english } from '../../i18n/en';
import { locale as spanish } from '../../i18n/es';
import { Subscription } from 'rxjs/Subscription';
import { DatePipe } from '@angular/common';
import { FormGroup, FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material';
import { MapRef } from './entities/agmMapRef';
import { MarkerRef, VehiclePoint, MARKER_REF_ORIGINAL_INFO_WINDOW_CONTENT } from './entities/markerRef';
import { of, from, forkJoin, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, startWith, tap, map, mergeMap, toArray, filter, mapTo } from 'rxjs/operators';
import { VehicleDetailService } from '../vehicle-detail.service';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'vehicle-location',
  templateUrl: './vehicle-location.component.html',
  styleUrls: ['./vehicle-location.component.scss'],
  animations: fuseAnimations,
})
export class VehicleLocationComponent implements OnInit, OnDestroy {
  isPlatformAdmin = false;

  @Input('vehicle') vehicle: any;

  @ViewChild('gmap') gmapElement: any;


  mapTypes = [
    google.maps.MapTypeId.HYBRID,
    google.maps.MapTypeId.ROADMAP,
    google.maps.MapTypeId.SATELLITE,
    google.maps.MapTypeId.TERRAIN
  ];

  map: MapRef;
  bounds: google.maps.LatLngBounds;
  markers: MarkerRef[] = [];
  selectedMarker: MarkerRef;

  PLATFORM_ADMIN = 'PLATFORM-ADMIN';
  subscriptions: Subscription[] = [];

  constructor(
    private vehicleDetailService: VehicleDetailService,
    private translationLoader: FuseTranslationLoaderService,
    public snackBar: MatSnackBar,
    private keycloakService: KeycloakService,
    private translateService: TranslateService,
    private datePipe: DatePipe
    ) {
      this.translationLoader.loadTranslations(english, spanish);
  }

  ngOnInit() {

    this.initMap(); // initialize the map element
  //   this.isPlatformAdmin = this.keycloakService.getUserRoles(true).includes(this.PLATFORM_ADMIN);
    this.initObservables();

  // concat(
  //   // update the [isPLATFORM-ADMIN] variable
  //   of(this.keycloakService.getUserRoles(true).includes(this.PLATFORM_ADMIN))
  //   .pipe(
  //     tap((isPlatformAdmin) => this.isPlatformAdmin = isPlatformAdmin )
  //   )

  // )
  // .subscribe(r => {}, err => {}, () => {});
  }

   /**
   * Adjusts the zoom according to the markers
   */
  adjustZoomAccordingToTheMarkers$(){
    return of(new google.maps.LatLngBounds())
      .pipe(
        map(bounds => this.bounds = bounds),
        mergeMap(() => from(this.markers)
          .pipe(
            map(marker => new google.maps.LatLng(marker.getPosition().lat(), marker.getPosition().lng())),
            tap(coordinates => this.bounds.extend(coordinates)),
            toArray()
          )
        ),
        map(() => {
          this.map.fitBounds(this.bounds);
          this.map.panToBounds(this.bounds);
        })
      );

  }

  /**
   * Creates the MarkerRef object and push it to the map and the markers array
   * @param posList List with all Pos items to draw in the map
   */
  drawPosList$(posList: any[]) {
    return posList && posList.length > 0
      ? from(posList)
        .pipe(
          tap(i => console.log('ITERANDO LOS ELEMENTOS DE drawPosList', i)),
          map((p) => new MarkerRef(
            new VehiclePoint(this.vehicle._id, 0, 'BUSINESS_ID', 'BUSINESS_NAME', undefined),
            {
              position: {
                lat: parseFloat(p.location.coordinates.lat),
                lng: parseFloat(p.location.coordinates.long)
              }, map: null
            }
          )),
          tap(marker => marker.setMap(this.map)),
          tap(marker => this.addMarkerToMap(marker)),
          toArray()
        )
      : of(null);
  }

  clearMap$(){
    return from(this.markers)
    .pipe(
      filter(() => this.markers.length > 0),
      map(marker => marker.setMap(null)),
      toArray(),
      map(() => this.markers = [])
    );
  }

  /**
   * Update markert clusterer, removing the markers in the cluster and then pushing the new posItems int he markers array
   */
  // updateMarkerClusterer$() {
  //   return of(this.markerClusterer)
  //     .pipe(
  //       // clear the cluster markers
  //       map(markerCluster => {
  //         if (markerCluster){
  //           this.markerClusterer.clearMarkers();
  //           console.log('SE HA LIPIADO EL CLUSTERER');
  //         }
  //         return null;
  //       }),
  //       filter(() => (this.markers && this.markers.length > 0)),
  //       map(() => {
  //         console.log('SE VAN A INSERTAR LOS MARCADORES => ', this.markers);
  //         this.markerClusterer = new MarkerCluster(this.map, this.markers,
  //           { imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m' });
  //         return true;
  //       })

  //     );
  // }


  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  initMap() {
    this.map = new MapRef(this.gmapElement.nativeElement, {
      center: new google.maps.LatLng(6.1701312, -75.6058417),
      zoom: 14,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    });
  }

   /**
   * Adds a marker to the map and configure observables to listen to the events associated with the marker (Click, etc)
   * @param marker marker to be added
   */
  addMarkerToMap(marker: MarkerRef) {
    marker.inizialiteEvents();

    marker.clickEvent.subscribe(event => {
      this.onMarkerClick(marker, event);
    });

    this.markers.push(marker);
  }

  /**
   * Opens the infoWindow of the clicked marker and closes the other infoWindows in case that these were open.
   * @param marker clicked marker
   * @param event Event
   */
  onMarkerClick(marker: MarkerRef, event) {
    this.selectedMarker = marker;
    this.markers.forEach(m => {
      m.infoWindow.close();
      m.setAnimation(null);
    });
    marker.setAnimation(google.maps.Animation.BOUNCE);
    marker.setAnimation(null);
    marker.infoWindow.open(this.map, marker);
  }

   initObservables(){

    this.subscriptions.push(
      this.vehicleDetailService.listenVehicleLocationUpdates$(this.vehicle._id)
      .pipe(
        mergeMap(newLocation => (this.markers.length === 0)
          ? this.drawPosList$([{ location: { coordinates: { lat: newLocation.lat, long: newLocation.lng } } }])
          : of(newLocation)
            .pipe(
              map(() => this.markers[0].updateData(newLocation.lng, newLocation.lat, 2000, Date.now(), true, true))
            )
        )
      )
      .subscribe()
    );

    this.subscriptions.push(
      this.translateService.onLangChange
      .pipe(
        map(lang => lang.translations.MARKER.INFOWINDOW),
        mergeMap(translations => this.updateMarkerInfoWindowContent$(translations) )
      )
      .subscribe(() => { }, err => console.error(err), () => { })
    );
  }

  // onSelectBusinessEvent(business: any){
  //   this.selectedBusiness = business;
  // }

  updateMarkerInfoWindowContent$(translations: any) {
    return from(this.markers)
      .pipe(
        map((marker) => ({
          marker: marker,
          infoWindowContent: MARKER_REF_ORIGINAL_INFO_WINDOW_CONTENT
            .replace('$$POS_DETAILS$$', translations.POS_DETAILS)
            .replace('$$POS_ID$$', translations.POS_ID)
            // .replace('$$BUSINESS_ID$$', translations.BUSISNESS_ID)
            .replace('$$BUSINESS_NAME$$', translations.BUSINESS_NAME)
            .replace('$$USER_NAME$$', translations.USER_NAME)
            .replace('$$LAST_UPDATE$$', translations.LAST_UPDATE)
            .replace('{POS_ID}', marker.vehiclePoint._id)
            // .replace('{BUSINESS_ID}', marker.posPoint.businessId)
            .replace('{BUSINESS_NAME}', marker.vehiclePoint.businessName)
            .replace('{LAST_UPDATE}', this.datePipe.transform(new Date(marker.vehiclePoint.lastUpdate), 'dd-MM-yyyy HH:mm'))
        })),
        map(({ marker, infoWindowContent }) => marker.infoWindow.setContent(infoWindowContent))
      );
  }


}
