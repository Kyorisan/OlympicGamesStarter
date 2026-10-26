import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { StatePanelComponent } from './state-panel.component';

describe('StatePanelComponent', () => {
  let component: StatePanelComponent;
  let fixture: ComponentFixture<StatePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [StatePanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StatePanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show skeletons while loading', () => {
    component.state = 'loading';
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('should fall back to a default empty message', () => {
    component.state = 'empty';
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Aucune donnée');
  });

  it('should render nothing once data is loaded', () => {
    component.state = 'loaded';
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.state')).toBeNull();
  });
});