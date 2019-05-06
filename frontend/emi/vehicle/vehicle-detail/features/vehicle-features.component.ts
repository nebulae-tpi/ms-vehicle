////////// ANGULAR //////////
import {
  Component,
  OnInit,
  OnDestroy,
  Input
} from '@angular/core';

import {
  FormGroup,
  FormControl,
  Validators,
  FormArray
} from '@angular/forms';

////////// RXJS ///////////
import {
  map,
  mergeMap,
  filter,
  tap,
  takeUntil,
} from 'rxjs/operators';

import { Subject, of } from 'rxjs';

//////////// ANGULAR MATERIAL ///////////
import {
  MatSnackBar,
  MatDialog
} from '@angular/material';

//////////// i18n ////////////
import {
  TranslateService
} from '@ngx-translate/core';
import { locale as english } from '../../i18n/en';
import { locale as spanish } from '../../i18n/es';
import { FuseTranslationLoaderService } from '../../../../../core/services/translation-loader.service';

//////////// Others ////////////
import { KeycloakService } from 'keycloak-angular';
import { VehicleDetailService } from '../vehicle-detail.service';
import { DialogComponent } from '../../dialog/dialog.component';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'vehicle-features',
  templateUrl: './vehicle-features.component.html',
  styleUrls: ['./vehicle-features.component.scss']
})
// tslint:disable-next-line:class-name
export class VehicleDetailFeaturesComponent implements OnInit, OnDestroy {
  // Subject to unsubscribe
  private ngUnsubscribe = new Subject();

  @Input('pageType') pageType: string;
  @Input('vehicle') vehicle: any;

  trialDaysCtrl = new FormControl(0, [Validators.min(1), Validators.max(14), Validators.required]);

  otherFeatures = ['AC', 'TRUNK', 'ROOF_RACK', 'PETS', 'BIKE_RACK' ];

  vehicleFeaturesForm: any;
  fuelTypes = ['GASOLINE', 'GAS', 'GAS_AND_GASOLINE', 'DIESEL', 'ELECTRIC'];
  canViewSubscriptionInfo = false;
  rolesToViewSubscriptionInfo = ['PLATFORM-ADMIN', 'BUSINESS-OWNER'];
  dateNow = Date.now();

  constructor(
    private translationLoader: FuseTranslationLoaderService,
    private translate: TranslateService,
    public snackBar: MatSnackBar,
    private VehicleDetailservice: VehicleDetailService,
    private dialog: MatDialog,
    private keycloakService: KeycloakService
  ) {
      this.translationLoader.loadTranslations(english, spanish);
  }


  ngOnInit() {
    this.vehicleFeaturesForm = new FormGroup({
      fuel: new FormControl(this.vehicle ? (this.vehicle.features || {}).fuel : ''),
      capacity: new FormControl(this.vehicle ? (this.vehicle.features || {}).capacity : ''),
      others : new FormArray([])
    });

    if (this.vehicle.features){
      this.vehicle.features.others.forEach(feature => {
        (this.vehicleFeaturesForm.get('others') as FormArray).push(
          new FormGroup({
            name: new FormControl(feature.name),
            active: new FormControl(feature.active)
          })
        );
      });
    }



    this.otherFeatures.forEach(featureKey => {
      const featureControl = (this.vehicleFeaturesForm.get('others') as FormArray).controls.find(control => control.get('name').value === featureKey);
      if (!featureControl){
        (this.vehicleFeaturesForm.get('others') as FormArray).push(
          new FormGroup({
            name: new FormControl(featureKey),
            active: new FormControl(false)
          })
        );
      }
    });

    this.checkIfUserCanViewSubscriptionInfo();



  }

  checkIfUserCanViewSubscriptionInfo() {
    of(this.keycloakService.getUserRoles(true))
    .pipe(
      map((userRoles: string[]) => userRoles.filter(value => -1 !== this.rolesToViewSubscriptionInfo.indexOf(value)).length),
      map(commonRoles => commonRoles > 0),
      takeUntil(this.ngUnsubscribe)
    )
    .subscribe( r => this.canViewSubscriptionInfo = r);
  } 


  updateVehicleFeatures() {
    this.showConfirmationDialog$('VEHICLE.UPDATE_MESSAGE', 'VEHICLE.UPDATE_TITLE')
      .pipe(
        mergeMap(ok =>
          this.VehicleDetailservice.updateVehicleVehicleFeatures$(this.vehicle._id, {
            fuel: this.vehicleFeaturesForm.getRawValue().fuel,
            capacity: this.vehicleFeaturesForm.getRawValue().capacity,
            others: this.vehicleFeaturesForm.getRawValue().others
          })
        ),
        mergeMap(resp => this.graphQlAlarmsErrorHandler$(resp)),
        filter((resp: any) => !resp.errors || resp.errors.length === 0),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe(result => {
        this.showSnackBar('VEHICLE.WAIT_OPERATION');
      },
        error => {
          this.showSnackBar('VEHICLE.ERROR_OPERATION');
          console.log('Error ==> ', error);
        }
      );

  }

  applyTrial(){
    const trialDays = this.trialDaysCtrl.value;
    if ( 0 < trialDays && trialDays < 15){      
      this.VehicleDetailservice.applyFreeTrialSubscription$(this.vehicle._id, trialDays)
      .pipe(
        mergeMap(resp => this.graphQlAlarmsErrorHandler$(resp)),
        filter(resp => (resp.data && resp.data.ApplyFreeTrialSubscription)),
        tap(resp => {
          if(resp.data.ApplyFreeTrialSubscription.code == 200){            
            this.showMessageSnackbar(this.translate.instant('SUCCESS.APPLY_FREE_TRIAL_SUBSCRIPTION'));
            this.vehicle = {...this.vehicle, subscription:  { expirationTime: Date.now()-1000, status: 'ACTIVE'} };
          }
        })
      )
      .subscribe(r => console.log(r), e => console.log(e), () => {})
    }  
  }


  showConfirmationDialog$(dialogMessage, dialogTitle) {
    return this.dialog
      // Opens confirm dialog
      .open(DialogComponent, {
        data: {
          dialogMessage,
          dialogTitle
        }
      })
      .afterClosed()
      .pipe(
        filter(okButton => okButton),
      );
  }

  showSnackBar(message) {
    this.snackBar.open(this.translationLoader.getTranslate().instant(message),
      this.translationLoader.getTranslate().instant('VEHICLE.CLOSE'), {
        duration: 6000
      });
  }

  graphQlAlarmsErrorHandler$(response) {
    return of(JSON.parse(JSON.stringify(response))).pipe(
      tap((resp: any) => {
        if (response && Array.isArray(response.errors)) {
          response.errors.forEach(error => {
            this.showMessageSnackbar('ERRORS.' + ((error.extensions||{}).code || 1) )
          });
        }
        return resp;
      })
    );
  }

  /**
   * Shows a message snackbar on the bottom of the page
   * @param messageKey Key of the message to i18n
   * @param detailMessageKey Key of the detail message to i18n
   */
  showMessageSnackbar(messageKey, detailMessageKey?) {
    const translationData = [];
    if (messageKey) {
      translationData.push(messageKey);
    }

    if (detailMessageKey) {
      translationData.push(detailMessageKey);
    }

    this.translate.get(translationData)
      .subscribe(data => {
        this.snackBar.open(
          messageKey ? data[messageKey] : '',
          detailMessageKey ? data[detailMessageKey] : '',
          {
            duration: 4000
          }
        );
      });
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

}
