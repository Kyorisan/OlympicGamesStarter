import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { HeaderComponent } from '../../components/header/header.component';
import { PieChartComponent } from '../../components/pie-chart/pie-chart.component';
import { StatePanelComponent } from '../../components/state-panel/state-panel.component';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      declarations: [
        DashboardComponent,
        HeaderComponent,
        PieChartComponent,
        StatePanelComponent,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the state panel while data is loading', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-state-panel')).not.toBeNull();
    expect(compiled.querySelector('app-pie-chart')).toBeNull();
  });
});