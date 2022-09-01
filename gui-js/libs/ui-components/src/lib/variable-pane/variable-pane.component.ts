import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CommunicationService,
  ElectronService,
  WindowUtilityService,
} from '@minsky/core';
import {
  commandsMapping,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
  green
} from '@minsky/shared';
import { AutoUnsubscribe } from 'ngx-auto-unsubscribe';
import { fromEvent, Observable } from 'rxjs';
import { sampleTime } from 'rxjs/operators';

@AutoUnsubscribe()
@Component({
  selector: 'minsky-variable-pane',
  templateUrl: './variable-pane.component.html',
  styleUrls: ['./variable-pane.component.scss'],
})
export class VariablePaneComponent implements OnDestroy, AfterViewInit {
  @ViewChild('variablePaneWrapper') variablePaneWrapper: ElementRef;

  itemId: number;
  systemWindowId: number;
  namedItemSubCommand: string;

  leftOffset = 0;
  topOffset: number;
  height: number;
  width: number;
  variablePaneContainer: HTMLElement;
  mouseMove$: Observable<MouseEvent>;

  mouseX = 0;
  mouseY = 0;

  constructor(
    private communicationService: CommunicationService,
    private windowUtilityService: WindowUtilityService,
    private electronService: ElectronService,
    private route: ActivatedRoute
  ) {
    this.route.queryParams.subscribe((params) => {
      this.itemId = params.itemId;
      this.systemWindowId = params.systemWindowId;
    });
  }

  ngAfterViewInit() {
    this.namedItemSubCommand = "/minsky/variablePane";
    this.getWindowRectInfo();
    this.renderFrame();
    this.initEvents();
  }

  windowResize() {
    this.getWindowRectInfo();
    this.renderFrame();
  }
  private getWindowRectInfo() {
    this.variablePaneContainer = this.variablePaneWrapper
      .nativeElement as HTMLElement;

    const clientRect = this.variablePaneContainer.getBoundingClientRect();

    this.leftOffset = Math.round(clientRect.left);
//    this.topOffset = Math.round(
//      this.windowUtilityService.getElectronMenuBarHeight()
//    );
      this.topOffset = 20;
      
    this.height = Math.round(this.variablePaneContainer.clientHeight);
      this.width = Math.round(this.variablePaneContainer.clientWidth-this.topOffset);
  }

  renderFrame() {
    if (
      this.electronService.isElectron &&
      this.systemWindowId &&
      this.height &&
      this.width
    ) {
      const scaleFactor = this.electronService.remote.screen.getPrimaryDisplay()
        .scaleFactor;

      this.electronService.sendMinskyCommandAndRender({
          command: `/minsky/variablePane/updateWithHeight ${this.height}`,
      });

      this.electronService.sendMinskyCommandAndRender({
          command: `/minsky/variablePane/renderFrame [${this.systemWindowId},${this.leftOffset},${this.topOffset},${this.width},${this.height},${scaleFactor}]`,
      });
    }
  }

  initEvents() {
//    this.variablePaneContainer.addEventListener('scroll', async () => {
//      await this.handleScroll(
//        this.variablePaneContainer.scrollTop,
//        this.variablePaneContainer.scrollLeft
//      );
//    });

    this.mouseMove$ = fromEvent<MouseEvent>(
      this.variablePaneContainer,
      'mousemove'
    ).pipe(sampleTime(1)); /// FPS=1000/sampleTime

    this.mouseMove$.subscribe(async (event: MouseEvent) => {
      const { clientX, clientY } = event;
      this.mouseX = clientX;
      this.mouseY = clientY;
      this.sendMouseEvent(
        clientX,
        clientY,
        commandsMapping.MOUSEMOVE_SUBCOMMAND
      );
    });

    this.variablePaneContainer.addEventListener('mousedown', (event) => {
      const { clientX, clientY } = event;
      this.sendMouseEvent(
        clientX,
        clientY,
        commandsMapping.MOUSEDOWN_SUBCOMMAND
      );
    });

    this.variablePaneContainer.addEventListener('mouseup', async (event) => {
      const { clientX, clientY } = event;
      await this.sendMouseEvent(
        clientX,
        clientY,
        commandsMapping.MOUSEUP_SUBCOMMAND
      );
    });

//    this.variablePaneContainer.onwheel = this.onMouseWheelZoom;
    document.onkeydown = this.onKeyDown;
    document.onkeyup = this.onKeyUp;
  }

  async redraw() {
    await this.electronService.sendMinskyCommandAndRender({
      command: "/minsky/variablePane/requestRedraw",
    });
  }

  async sendMouseEvent(x: number, y: number, type: string) {
    const command = `/minsky/variablePane/${type} [${x},${y}]`;

    await this.electronService.sendMinskyCommandAndRender({
      command,
    });

    await this.redraw();
  }

  onKeyDown = async (event: KeyboardEvent) => {
      if (event.shiftKey) {
          await this.electronService.sendMinskyCommandAndRender({
              command:"/minsky/variablePane/shift true"
          });

          await this.redraw();
      }
  };
  onKeyUp = async (event: KeyboardEvent) => {
      if (event.shiftKey) {
          await this.electronService.sendMinskyCommandAndRender({
              command:"/minsky/variablePane/shift false"
          });

          await this.redraw();
      }
  };

    async select(id) {
        if (document.forms["variablePane"]["variablePane::"+id].checked)
            await this.electronService.sendMinskyCommandAndRender({
                command:`/minsky/variablePane/select "${id}"`
            });
        else
            await this.electronService.sendMinskyCommandAndRender({
                command:`/minsky/variablePane/deselect "${id}"`
            });
        this.electronService.sendMinskyCommandAndRender({
            command: `/minsky/variablePane/updateWithHeight ${this.height}`,
        });
    }
    
  // eslint-disable-next-line @typescript-eslint/no-empty-function,@angular-eslint/no-empty-lifecycle-method
  ngOnDestroy() {}
}