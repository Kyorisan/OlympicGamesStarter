import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PieChartComponent } from './pie-chart.component';

describe('PieChartComponent', () => {
  let component: PieChartComponent;
  let fixture: ComponentFixture<PieChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PieChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PieChartComponent);
    component = fixture.componentInstance;
    component.labels = ['France', 'Italy'];
    component.values = [113, 96];
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose a keyboard-reachable entry per slice', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('.chart-fallback-item');
    expect(buttons.length).toBe(2);
  });

  it('should emit the index of the activated entry', () => {
    spyOn(component.sliceClick, 'emit');
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll<HTMLButtonElement>(
      '.chart-fallback-item'
    );
    buttons[1].click();
    expect(component.sliceClick.emit).toHaveBeenCalledWith(1);
  });
});