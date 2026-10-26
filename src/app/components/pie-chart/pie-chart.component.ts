import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';

import { Chart } from 'chart.js/auto';

const PALETTE = [
  '#0b868f',
  '#adc3de',
  '#7a3c53',
  '#8f6263',
  '#d98f3f',
  '#94819d',
];

@Component({
  selector: 'app-pie-chart',
  templateUrl: './pie-chart.component.html',
  styleUrls: ['./pie-chart.component.scss'],
})

export class PieChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() labels: string[] = [];
  @Input() values: number[] = []

  @Input() description = '';

  @Output() sliceClick = new EventEmitter<number>();

  @ViewChild('chartCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private chart?: Chart<'pie', number[], string>;

  ngAfterViewInit(): void {
    this.createChart();
  }

  ngOnChanges(): void {
    if (this.chart) {
      this.chart.data.labels = this.labels;
      this.chart.data.datasets[0].data = this.values;
      this.chart.data.datasets[0].backgroundColor = this.colors();
      this.chart.update();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = undefined;
  }

  private createChart(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    this.chart = new Chart<'pie', number[], string>(canvas, {
      type: 'pie',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: 'Medals',
            data: this.values,
            backgroundColor: this.colors(),
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event) => this.handleClick(event),
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });
  }

  private handleClick(event: { native: Event | null }): void {
    if (!this.chart || !event.native) {
      return;
    }
    const points = this.chart.getElementsAtEventForMode(
      event.native,
      'nearest',
      { intersect: true },
      true
    );
    if (points.length > 0) {
      this.sliceClick.emit(points[0].index);
    }
  }

  private colors(): string[] {
    return this.labels.map((_, index) => PALETTE[index % PALETTE.length]);
  }
}
