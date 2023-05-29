////////// ANGULAR //////////
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef
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

////////// ANGULAR MATERIAL //////////
import {
  MatPaginator,
  MatSort,
  MatTableDataSource,
  MatSnackBar,
  MatDialog
} from '@angular/material';
import { fuseAnimations } from '../../../../core/animations';

//////////// i18n ////////////
import {
  TranslateService,
  LangChangeEvent,
  TranslationChangeEvent
} from '@ngx-translate/core';
import { locale as english } from '../i18n/en';
import { locale as spanish } from '../i18n/es';
import { FuseTranslationLoaderService } from '../../../../core/services/translation-loader.service';

///////// DATEPICKER //////////
import { MAT_MOMENT_DATE_FORMATS } from './my-date-format';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MomentDateAdapter
} from '@coachcare/datepicker';

import * as moment from 'moment';

//////////// Other Services ////////////
import { KeycloakService } from 'keycloak-angular';
import { VehicleListService } from './vehicle-list.service';
import { ToolbarService } from '../../../toolbar/toolbar.service';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'vehicle',
  templateUrl: './vehicle-list.component.html',
  styleUrls: ['./vehicle-list.component.scss'],
  animations: fuseAnimations,
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es' },
    {
      provide: DateAdapter,
      useClass: MomentDateAdapter,
      deps: [MAT_DATE_LOCALE]
    },
    { provide: MAT_DATE_FORMATS, useValue: MAT_MOMENT_DATE_FORMATS }
  ]
})
export class VehicleListComponent implements OnInit, OnDestroy {
  // Subject to unsubscribe
  private ngUnsubscribe = new Subject();

  //////// FORMS //////////
  filterForm: FormGroup;


  /////// TABLE /////////

  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator)
  paginator: MatPaginator;
  tableSize: number;
  tablePage = 0;
  tableCount = 10;
  threeStates = ["null", "true", "false"];
  onTrialthreeStates = ["null", "true", "false"];

  // Columns to show in the table
  displayedColumns = [
    'licensePlate',
    'model',
    'state',
    'blockings',
    'creatorUser',
    'modifierUser',
    'modificationTimestamp',
  ];

  /////// OTHERS ///////

  canViewSubscriptionInfo = false;

  rolesToViewSubscriptionInfo = ['PLATFORM-ADMIN', 'BUSINESS-OWNER'];

  selectedVehicle: any = null;

  constructor(
    private formBuilder: FormBuilder,
    private translationLoader: FuseTranslationLoaderService,
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private router: Router,
    private activatedRouter: ActivatedRoute,
    private keycloakService: KeycloakService,
    private adapter: DateAdapter<any>,
    private VehicleListservice: VehicleListService,
    private toolbarService: ToolbarService,
    private dialog: MatDialog
  ) {
      this.translationLoader.loadTranslations(english, spanish);
  }


  ngOnInit() {
    this.onLangChange();
    this.buildFilterForm();
    this.checkIfUserCanViewSubscriptionInfo();
    this.updateFilterDataSubscription();
    this.updatePaginatorDataSubscription();
    this.loadLastFilters();
    this.refreshTableSubscription();
  }

  /**
   * Changes the internationalization of the dateTimePicker component
   */
  onLangChange() {
    this.translate.onLangChange
      .pipe(
        startWith({ lang: this.translate.currentLang }),
        takeUntil(this.ngUnsubscribe),
      )
      .subscribe(event => {
        if (event) {
          this.adapter.setLocale(event.lang);
        }
      });
  }

  /**
   * Emits the filter form data when it changes
   */
  listenFilterFormChanges$() {
    return this.filterForm.valueChanges.pipe(
      distinctUntilChanged()
    );
  }

  /**
   * Emits the paginator data when it changes
   */
  listenPaginatorChanges$() {
    return this.paginator.page;
  }

  /**
   * Builds filter form
   */
  buildFilterForm() {
    // Reactive Filter Form
    this.filterForm = this.formBuilder.group({
      subscriptionExpired: ['null'],
      onTrial: [false],
      licensePlate: [null],
      showBlocked: [false],
      showInactive: [false],
      creationTimestamp: [null],
      // creatorUser: [null],
      // modificationDate: [null],
      // modifierUser: [null],
    });

    this.filterForm.disable({
      onlySelf: true,
      emitEvent: false
    });
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

  updateFilterDataSubscription() {
    this.listenFilterFormChanges$()
      .pipe(
        takeUntil(this.ngUnsubscribe),
        tap( filterData =>  this.VehicleListservice.updateFilterData(filterData)), // --
        // tap(() => console.log('FILTER UPDATED')),
        // mergeMap(() => this.VehicleListservice.paginator$),
        // tap(({ pagination }) => {
        //   console.log('=======> ', pagination);
        //   this.VehicleListservice.updatePaginatorData({
        //     pagination: {
        //       page: 0, count: pagination.page, sort: -1
        //     }
        //   });
        // })

      )
      .subscribe();
  }

  updatePaginatorDataSubscription() {
    this.listenPaginatorChanges$()
      .pipe(
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe(pagination => {
        const paginator = {
          pagination: {
            page: pagination.pageIndex, count: pagination.pageSize, sort: -1
          },
        };
        this.VehicleListservice.updatePaginatorData(paginator);
      });
  }

  /**
   * First time that the page is loading is needed to check if there were filters applied previously to load this info into the forms
   */
  loadLastFilters() {
    combineLatest(
      this.VehicleListservice.filter$,
      this.VehicleListservice.paginator$
    ).pipe(
      take(1),
      map(([filterValue, paginator]) => {
        if (filterValue) {
          this.filterForm.patchValue({
            subscriptionExpired: filterValue.subscriptionExpired || 'null' ,
            onTrial: filterValue.onTrial ,
            showBlocked: filterValue.showBlocked,
            showInactive: filterValue.showInactive,
            licensePlate: filterValue.licensePlate,
            creationTimestamp: filterValue.creationTimestamp,
            creatorUser: filterValue.creatorUser
          });
        }

        if (paginator) {
          this.tablePage = paginator.pagination.page;
          this.tableCount = paginator.pagination.count;
        }

        return this.filterForm.enable({ emitEvent: true });
      })
    ).subscribe(() => {}, err => console.log(err), () => {});
  }

  /**
   * If a change is detect in the filter or the paginator then the table will be refreshed according to the values emmited
   */
  refreshTableSubscription() {
    combineLatest(this.VehicleListservice.filter$, this.VehicleListservice.paginator$, this.toolbarService.onSelectedBusiness$)
      .pipe(
        debounceTime(500),
        filter(([filterValue, paginator, selectedBusiness]) => filterValue != null && paginator != null), map(
          ([filterValue, paginator, selectedBusiness]) => {
            const filterInput = {
              subscriptionExpired: filterValue.subscriptionExpired,
              onTrial: filterValue.onTrial,
              businessId: selectedBusiness ? selectedBusiness.id : null,
              showBlocked: filterValue.showBlocked,
              showInactive: filterValue.showInactive,
              licensePlate: filterValue.licensePlate ? filterValue.licensePlate.trim() : null,
              creatorUser: filterValue.creatorUser,
              creationTimestamp: filterValue.creationTimestamp
                ? filterValue.creationTimestamp.startOf('day').valueOf()
                : null
            };
            const paginationInput = {
              page: paginator.pagination.page,
              count: paginator.pagination.count,
              sort: paginator.pagination.sort
            };

            return [filterInput, paginationInput];
          }
        ), mergeMap(([filterInput, paginationInput]) =>
          forkJoin(
            this.getvehicleList$(filterInput, paginationInput),
            this.getvehicleSize$(filterInput)
          )
        ), takeUntil(this.ngUnsubscribe))
      .subscribe(([list, size]) => {
        this.dataSource.data = list;
        this.tableSize = size;
      });
  }

  updateSubscriptionExpiredFilterState(){
    let currentStateAplied = this.filterForm.get('subscriptionExpired').value;
    currentStateAplied = this.threeStates[(this.threeStates.indexOf(currentStateAplied) + 1) % this.threeStates.length];
    // console.log('currentStateAplied ==> ', typeof currentStateAplied, ' ==> ', currentStateAplied);
    this.filterForm.get('subscriptionExpired').setValue(currentStateAplied);
  }

  updateOnTrialFilterState(){
    let currentStateAplied = this.filterForm.get('onTrial').value;
    currentStateAplied = this.onTrialthreeStates[(this.onTrialthreeStates.indexOf(currentStateAplied) + 1) % this.onTrialthreeStates.length];
    // console.log('currentStateAplied ==> ', typeof currentStateAplied, ' ==> ', currentStateAplied);
    this.filterForm.get('onTrial').setValue(currentStateAplied);
  }

  /**
   * Gets the vehicle list
   * @param filterInput
   * @param paginationInput
   */
  getvehicleList$(filterInput, paginationInput){
    return this.VehicleListservice.getvehicleList$(filterInput, paginationInput)
    .pipe(
      mergeMap(resp => this.graphQlAlarmsErrorHandler$(resp)),
      map(resp => resp.data.VehicleVehicles)
    );
  }

    /**
   * Gets the vehicle size
   * @param filterInput
   */
  getvehicleSize$(filterInput){
    return this.VehicleListservice.getvehicleSize$(filterInput)
    .pipe(
      mergeMap(resp => this.graphQlAlarmsErrorHandler$(resp)),
      map(resp => (resp.data && resp.data.VehicleVehiclesSize ) ? resp.data.VehicleVehiclesSize : 0)
    );
  }

  /**
   * Receives the selected vehicle
   * @param vehicle selected vehicle
   */
  selectvehicleRow(vehicle) {
    this.selectedVehicle = vehicle;
  }

  resetFilter() {
    this.filterForm.reset();
    this.paginator.pageIndex = 0;
    this.tablePage = 0;
    this.tableCount = 25;
    this.paginator._changePageSize(25);
    this.filterForm.get('subscriptionExpired').setValue('null');
    this.filterForm.get('onTrial').setValue('null');
  }

  /**
   * Navigates to the detail page
   */
  goToDetail(){
    this.toolbarService.onSelectedBusiness$
    .pipe(
      take(1)
    ).subscribe(selectedBusiness => {
      if (selectedBusiness == null || selectedBusiness.id == null){
        this.showSnackBar('VEHICLE.SELECT_BUSINESS');
      }else{
        this.router.navigate(['vehicle/new']);
      }
    });
  }

  showSnackBar(message) {
    this.snackBar.open(this.translationLoader.getTranslate().instant(message),
      this.translationLoader.getTranslate().instant('VEHICLE.CLOSE'), {
        duration: 4000
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

    this.translate.get(translationData).subscribe(data => {
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
