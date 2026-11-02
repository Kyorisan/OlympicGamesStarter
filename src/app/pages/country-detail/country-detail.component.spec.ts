import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, of } from 'rxjs';

import { HeaderComponent } from '../../components/header/header.component';
import { LineChartComponent } from '../../components/line-chart/line-chart.component';
import { StatePanelComponent } from '../../components/state-panel/state-panel.component';
import { Olympic } from '../../models/olympic.model';
import { ViewState } from '../../models/view-state.model';
import { DataService } from '../../services/data.service';
import { CountryDetailComponent } from './country-detail.component';

const FIXTURE: Olympic[] = [
  {
    id: 1,
    country: 'Spain',
    participations: [
      { id: 1, year: 2016, city: 'Rio', medalsCount: 5, athleteCount: 50 },
      { id: 2, year: 2012, city: 'Londres', medalsCount: 10, athleteCount: 100 },
    ],
  },
  { id: 2, country: 'Atlantis', participations: [] },
];

class DataServiceStub {
  constructor(private readonly state: ViewState = 'loaded') {}

  getState(): Observable<ViewState> {
    return of(this.state);
  }

  getOlympicById(id: number): Observable<Olympic | undefined> {
    return of(FIXTURE.find((olympic) => olympic.id === id));
  }

  sumMedals(olympic: Olympic): number {
    return olympic.participations.reduce((t, p) => t + p.medalsCount, 0);
  }

  sumAthletes(olympic: Olympic): number {
    return olympic.participations.reduce((t, p) => t + p.athleteCount, 0);
  }
}

async function setup(
  id: string,
  state: ViewState = 'loaded'): Promise<ComponentFixture<CountryDetailComponent>> {
  await TestBed.configureTestingModule({
    imports: [HttpClientTestingModule, RouterTestingModule],
    declarations: [
      CountryDetailComponent,
      HeaderComponent,
      LineChartComponent,
      StatePanelComponent,
    ],
    providers: [
      { provide: DataService, useValue: new DataServiceStub(state) },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id })) },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CountryDetailComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<CountryDetailComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function el(
  fixture: ComponentFixture<CountryDetailComponent>,
  selector: string
): Element | null {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

describe('CountryDetailComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('should create', async () => {
    const fixture = await setup('1');
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show the country, its indicators and its chart', async () => {
    const fixture = await setup('1');
    expect(el(fixture, 'h1')?.textContent).toContain('Spain');
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.header-indicator'
      ).length
    ).toBe(3);
    expect(el(fixture, 'app-line-chart')).not.toBeNull();
  });

  it('should order participations chronologically', async () => {
    const fixture = await setup('1');
    const years = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody th')
    ).map((cell) => cell.textContent?.trim());
    
    expect(years).toEqual(['2012', '2016']);
  });

  it('should report an unknown id instead of crashing', async () => {
    const fixture = await setup('999');
    expect(text(fixture)).toContain("Ce pays n'existe pas");
    expect(el(fixture, 'app-line-chart')).toBeNull();
  });

  it('should report a non-numeric id', async () => {
    const fixture = await setup('abc');
    expect(text(fixture)).toContain("Ce pays n'existe pas");
  });

  it('should report a country with no participation', async () => {
    const fixture = await setup('2');
    expect(text(fixture)).toContain("Aucune participation enregistrée");
    expect(el(fixture, 'app-line-chart')).toBeNull();
  });

  it('should offer a way back when something is missing', async () => {
    const fixture = await setup('999');
    expect(el(fixture, 'app-state-panel a')).not.toBeNull();
  });

  it('should surface a loading state', async () => {
    const fixture = await setup('1', 'loading');
    expect(el(fixture, '.skeleton')).not.toBeNull();
    expect(el(fixture, 'app-line-chart')).toBeNull();
  });

  it('should surface a service error', async () => {
    const fixture = await setup('1', 'error');
    expect(text(fixture)).toContain("pas pu être chargées");
  });
});