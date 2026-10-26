import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { Olympic } from '../models/olympic.model';
import { ViewState } from '../models/view-state.model';
import { DataService } from './data.service';

const FIXTURE: Olympic[] = [
  {
    id: 1,
    country: 'Spain',
    participations: [
      { id: 1, year: 2012, city: 'Londres', medalsCount: 10, athleteCount: 100 },
      { id: 2, year: 2016, city: 'Rio', medalsCount: 5, athleteCount: 50 },
    ],
  },
  {
    id: 2,
    country: 'Italy',
    participations: [
      { id: 3, year: 2016, city: 'Rio', medalsCount: 7, athleteCount: 70 },
    ],
  },
]; 

describe('DataService', () => {
  let service: DataService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(DataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function load(data: Olympic[] = FIXTURE): void {
    service.getOlympics().subscribe();
    httpMock.expectOne(environment.apiUrl).flush(data);
  }

  function fail(): void {
    service.getOlympics().subscribe();
    httpMock
      .expectOne(environment.apiUrl)
      .flush('boom', { status: 500, statusText: 'Server Error' });
  }

    function latest<T>(source: { subscribe(fn: (value: T) => void): unknown }): T {
    let captured!: T;
    source.subscribe((value) => (captured = value));
    return captured;
  }

  it('should be created without issuing a request', () => {
    expect(service).toBeTruthy();
    httpMock.expectNone(environment.apiUrl);
  });

  it('should only issue a single request for several consumers', () => {
    service.getOlympics().subscribe();
    service.getCountryCount().subscribe();
    service.getMedalsByCountry().subscribe();

    const requests = httpMock.match(environment.apiUrl);
    expect(requests.length).toBe(1);
    requests[0].flush(FIXTURE);
  });

  it('should count countries', () => {
    load();
    expect(latest(service.getCountryCount())).toBe(2);
  });

  it('should count distinct olympic games across countries', () => {
    load();
    expect(latest(service.getGameCount())).toBe(2);
  });

  it('should total medals per country and sort alphabetically', () => {
    load();
    const medals = latest(service.getMedalsByCountry());
    expect(medals.map((medal) => medal.country)).toEqual(['Italy', 'Spain']);
    expect(medals.map((medal) => medal.total)).toEqual([7, 15]);
  });

  it('should find a country by its id', () => {
    load();
    expect(latest(service.getOlympicById(1))?.country).toBe('Spain');
  });

  it('should return undefined for an unknown id', () => {
    load();
    expect(latest(service.getOlympicById(999))).toBeUndefined();
  });

  it('should sum athletes across participations', () => {
    load();
    const spain = latest(service.getOlympicById(1));
    expect(spain).toBeDefined();
    expect(service.sumAthletes(spain!)).toBe(150);
  });

  it('should reach the loaded state on success', () => {
    load();
    expect(latest<ViewState>(service.getState())).toBe('loaded');
  });

  it('should reach the empty state on an empty payload', () => {
    load([]);
    expect(latest<ViewState>(service.getState())).toBe('empty');
  });

  it('should reach the error state when the request fails', () => {
    fail();
    expect(latest<ViewState>(service.getState())).toBe('error');
    expect(latest(service.getOlympics())).toEqual([]);
  });
});