import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { CountryDetailComponent } from './country-detail.component';
import { HeaderComponent } from '../../components/header/header.component';
import { LineChartComponent } from '../../components/line-chart/line-chart.component';
import { StatePanelComponent } from '../../components/state-panel/state-panel.component';

describe('CountryDetailComponent', () => {
  let component: CountryDetailComponent;
  let fixture: ComponentFixture<CountryDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      declarations: [
        CountryDetailComponent,
        HeaderComponent,
        LineChartComponent,
        StatePanelComponent,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CountryDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not render the chart before data is available', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-line-chart')).toBeNull();
    expect(compiled.querySelector('app-state-panel')).not.toBeNull();
  });
});