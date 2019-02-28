////////// ANGULAR //////////
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Input
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators
} from '@angular/forms';

import { Router, ActivatedRoute } from '@angular/router';

////////// RXJS ///////////
import {
  map,
  mergeMap,
  switchMap,
  toArray,
  filter,
  tap,
  takeUntil,
  startWith,
  debounceTime,
  distinctUntilChanged,
  take
} from 'rxjs/operators';

import { Subject, fromEvent, of, forkJoin, Observable, concat, combineLatest } from 'rxjs';

//////////// ANGULAR MATERIAL ///////////
import {
  MatPaginator,
  MatSort,
  MatTableDataSource,
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
import { ToolbarService } from '../../../../toolbar/toolbar.service';
import { ManualBlockDialogComponent } from './manual-block/manual-block.component';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'vehicle-blocks',
  templateUrl: './vehicle-blocks.component.html',
  styleUrls: ['./vehicle-blocks.component.scss']
})
// tslint:disable-next-line:class-name
export class VehicleBlocksComponent implements OnInit, OnDestroy {
  // Subject to unsubscribe
  private ngUnsubscribe = new Subject();

  @Input('vehicle') vehicle: any;

  vehicleblocksForm: any;

  /////// TABLE /////////

  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator)
  paginator: MatPaginator;
  tableSize: number;
  tablePage = 0;
  tableCount = 10;

  // Columns to show in the table
  displayedColumns = [
    'key',
    'startTime',
    'endTime',
    'user',
    'actions'
  ];

  userRoles = [];

  constructor(
    private translationLoader: FuseTranslationLoaderService,
    private translate: TranslateService,
    private formBuilder: FormBuilder,
    public snackBar: MatSnackBar,
    private router: Router,
    private activatedRouter: ActivatedRoute,
    private VehicleDetailservice: VehicleDetailService,
    private dialog: MatDialog,
    private toolbarService: ToolbarService,
    private keycloakService: KeycloakService
  ) {
      this.translationLoader.loadTranslations(english, spanish);
  }


  ngOnInit() {

    this.userRoles = this.keycloakService.getUserRoles();
    console.log(this.userRoles);

    this.VehicleDetailservice.getVehicleVehicleBlocks$(this.vehicle._id)
    .pipe(
      map(r => JSON.parse(JSON.stringify(r.data.VehicleVehicleBlocks))),
      tap(blocks =>  {
        this.dataSource.data = blocks;
      })
    ).subscribe(() => {}, err => console.log(err), () => {});

    // this.vehicleblocksForm = new FormGroup({
    //   fuel: new FormControl(this.vehicle ? (this.vehicle.blocks || {}).fuel : ''),
    //   capacity: new FormControl(this.vehicle ? (this.vehicle.blocks || {}).capacity : '')
    // });

    this.VehicleDetailservice.listenVehicleBlockAdded$(this.vehicle._id)
      .pipe(
        map(res => res.data.VehicleVehicleBlockAddedSubscription),
        tap(r => console.log(' listenVehicleBlockAdded SUSBCRIPTION ==> ', r)),
        tap(r => this.dataSource.data = [...this.dataSource.data, r] ),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe(OK => console.log(OK), err => console.log(err), () => console.log('COMPLETED'));

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
    return of(JSON.parse(JSON.stringify(response)))
      .pipe(
        tap((resp: any) => {
          this.showSnackBarError(resp);

          return resp;
        })
      );
  }

  /**
   * Shows an error snackbar
   * @param response
   */
  showSnackBarError(response) {
    if (response.errors) {

      if (Array.isArray(response.errors)) {
        response.errors.forEach(error => {
          if (Array.isArray(error)) {
            error.forEach(errorDetail => {
              this.showMessageSnackbar('ERRORS.' + errorDetail.message.code);
            });
          } else {
            response.errors.forEach( err => {
              this.showMessageSnackbar('ERRORS.' + err.message.code);
            });
          }
        });
      }
    }
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

  removeBlock(block) {
    this.showConfirmationDialog$('VEHICLE.REMOVE_BLOCK_MSG', 'VEHICLE.REMOVE_BLOCK_TITLE')
      .pipe(
        filter(response => response),
        mergeMap(() => this.VehicleDetailservice.removeDriverBlock$(this.vehicle._id, block.key)),
        mergeMap(res => this.graphQlAlarmsErrorHandler$(res)),
        tap(response => {
          if (!response.errors) {
            this.dataSource.data = this.dataSource.data.filter((e: any) => e.key !== block.key);
          }
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe(() => { }, err => console.log(err), () => {} );
  }

  createBlock(){
    return this.dialog
      // Opens confirm dialog
      .open(ManualBlockDialogComponent, {
        width: '70%',
        height: '80%',
        data: {
          mode: 'NEW',
          forbidddenBlockKeys: this.dataSource.data.map((e: any) => e.key )
        }
      })
      .afterClosed()
      .pipe(
        filter(okButton => okButton),
        tap(response => console.log('DIALOG RESPONSE ===>', response)),
        mergeMap(r => this.VehicleDetailservice.insertVehicleBlock$(this.vehicle._id, r)),
        mergeMap(r => this.graphQlAlarmsErrorHandler$(r)),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();
  }

  showBlockInfo(block: any) {
    console.log('SHOW BLOCK INFO', block);
    return this.dialog
      .open(ManualBlockDialogComponent, {
        width: '70%',
        height: '80%',
        data: {
          mode: 'VIEW',
          block: block
        }
      })
      .afterClosed()
      .pipe(
        filter(okButton => okButton),
        tap(response => console.log('DIALOG RESPONSE ===>', response)),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();

  }

}
