import {
  commandsMapping,
  events,
  importCSVerrorMessage,
  MainRenderingTabs,
  MinskyProcessPayload,
  normalizeFilePathForPlatform,
  RenderNativeWindow,
  version,
  Utility
} from '@minsky/shared';
import { dialog, ipcMain, shell } from 'electron';
import { join } from 'path';
import * as elog from 'electron-log';
import { RecordingManager } from './RecordingManager';
import { MinskyPreferences, StoreManager } from './StoreManager';
import { WindowManager } from './WindowManager';
import {restService} from '../backend-init';
const JSON5 = require('json5');

var log=elog;
if (!Utility.isDevelopmentMode()) { //clobber logging in production
  log.info=function(...args: any[]){};
};

// eslint-disable-next-line @typescript-eslint/no-var-requires

interface QueueItem {
  promise: Deferred;
  payload: MinskyProcessPayload;
}

class Deferred {
  public promise;
  public reject;
  public resolve;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.reject = reject;
      this.resolve = resolve;
    });
  }
}

function logFilter(c: string) {
  const logFilter=["mouseMove$", "requestRedraw$"];
  for (var i in logFilter)
    if (c.match(logFilter[i])) return false;
  return true;
}

// TODO refactor to use command and arguments separately
export function callRESTApi(command: string) {
  const {
    leftOffset,
    canvasWidth,
    canvasHeight,
    electronTopOffset,
    scaleFactor,
  } = WindowManager;

  if (!command) {
    log.error('callRESTApi called without any command');
    return {};
  }
  if (!restService) {
    log.error('Rest Service not ready');
    return {};
  }
  const commandMetaData = command.split(' ');
  const [cmd] = commandMetaData;
  let arg = '';
  if (commandMetaData.length >= 2) {
    arg = command.substring(command.indexOf(' ') + 1);
  }
  try {
    const response = restService.call(cmd, arg);
    if (logFilter(cmd))
      log.info('Rest API: ',cmd,arg,"=>",response);
    return JSON5.parse(response);
  } catch (error) {
    log.error('Rest API: ',cmd,arg,'=>Exception caught: ' + error?.message);
    if (cmd === commandsMapping.CANVAS_ITEM_IMPORT_FROM_CSV) {
      return importCSVerrorMessage;
    } else {
        if (error?.message)
            dialog.showMessageBoxSync(WindowManager.getMainWindow(),{
                message: error.message,
                type: 'error',
            });
        return error?.message;
    }
  }
}

if (callRESTApi("/minsky/minskyVersion")!=version)
  setTimeout(()=>{
    dialog.showMessageBoxSync({
      message: "Mismatch of front end and back end versions",
      type: 'warning',
    });
  },1000);

if (callRESTApi("/minsky/ravelExpired"))
  setTimeout(()=>{
    const button=dialog.showMessageBoxSync({
      message: "Your Ravel license has expired",
      type: 'warning',
      buttons: ["OK","Upgrade"],
    });
    if (button==1)
      shell.openExternal("https://ravelation.hpcoders.com.au");
  },1000);

const ravelIconFilePath = normalizeFilePathForPlatform(
  Utility.isDevelopmentMode()
    ? `${join(__dirname, 'assets/ravel-logo.svg')}`
    : `${join(process.resourcesPath, 'assets/ravel-logo.svg')}`
);
callRESTApi(`/minsky/setRavelIconResource ${ravelIconFilePath}`);


export class RestServiceManager {
  static currentMinskyModelFilePath: string;

  private static lastMouseMovePayload: MinskyProcessPayload = null;
  private static lastModelMoveToPayload: MinskyProcessPayload = null;
  private static payloadDataQueue: Array<QueueItem> = [];
  private static runningCommand = false;
  private static isQueueEnabled = true;
  private static canvasReady=false;
  private static lastZoomPayload: MinskyProcessPayload = null;
  static availableOperationsMappings: Record<string, string[]> = {};

  private static currentTab: MainRenderingTabs = MainRenderingTabs.canvas;
  static renderFrameRedraw: any;

  public static async setCurrentTab(tab: MainRenderingTabs) {
    if (tab !== this.currentTab) {
      // disable the old tab
//      this.handleMinskyProcess({
//        command: this.currentTab + '/disable',
//      });
      this.currentTab = tab;
      this.lastMouseMovePayload = null;
      this.lastModelMoveToPayload = null;
      this.lastZoomPayload = null;
//      await this.handleMinskyProcess({
//        command: commandsMapping.RENDER_FRAME_SUBCOMMAND,
//      });
      // delegate to new setCurrentTab method, for legacy support
      WindowManager.setCurrentTab(new RenderNativeWindow(tab));
    }
  }

  public static getCurrentTab(): MainRenderingTabs {
    return this.currentTab;
  }

  // arrange for renderFrame to be called
  public static async reInvokeRenderFrame() {
    await this.handleMinskyProcess({
      command: commandsMapping.RENDER_FRAME_SUBCOMMAND,
    });
  }

  private static async processCommandsInQueue(): Promise<unknown> {
    // Should be on a separate thread......? -Janak
    const shouldProcessQueue = this.isQueueEnabled
      ? !this.runningCommand && this.payloadDataQueue.length > 0
      : this.payloadDataQueue.length > 0;

    if (shouldProcessQueue) {
      const nextItem = this.payloadDataQueue.shift();

      if (nextItem.payload.command === commandsMapping.MOUSEMOVE_SUBCOMMAND) {
        this.lastMouseMovePayload = null;
      } else if (nextItem.payload.command === commandsMapping.MOVE_TO) {
        this.lastModelMoveToPayload = null;
      } else if (nextItem.payload.command === commandsMapping.ZOOM_IN) {
        this.lastZoomPayload = null;
      }
      this.runningCommand = true;
      const res = await this.handleMinskyPayload(nextItem.payload);
      nextItem.promise.resolve(res);
    }
    return;
  }

  private static async resumeQueueProcessing(): Promise<unknown> {
    this.runningCommand = false;
    return await this.processCommandsInQueue();
  }

  public static async handleMinskyProcess(
    payload: MinskyProcessPayload
  ): Promise<unknown> {
    const wasQueueEmpty = this.payloadDataQueue.length === 0;

    const shouldProcessQueue = this.isQueueEnabled
      ? !this.runningCommand && wasQueueEmpty
      : true;

    let queueItem: QueueItem = null;

    // TODO:: Take into account Tab when merging commands
    if (payload.command === commandsMapping.MOUSEMOVE_SUBCOMMAND) {
      if (this.lastMouseMovePayload !== null) {
        this.lastMouseMovePayload.mouseX = payload.mouseX;
        this.lastMouseMovePayload.mouseY = payload.mouseY;
      } else {
        queueItem = { payload, promise: new Deferred() };
        this.lastMouseMovePayload = payload;
        this.payloadDataQueue.push(queueItem);
      }
      this.lastModelMoveToPayload = null;
      this.lastZoomPayload = null;
    } else if (payload.command === commandsMapping.MOVE_TO) {
      if (this.lastModelMoveToPayload !== null) {
        this.lastModelMoveToPayload.mouseX = payload.mouseX;
        this.lastModelMoveToPayload.mouseY = payload.mouseY;
      } else {
        queueItem = { payload, promise: new Deferred() };
        this.lastModelMoveToPayload = payload;
        this.payloadDataQueue.push(queueItem);
      }
      this.lastMouseMovePayload = null;
      this.lastZoomPayload = null;
    } else if (payload.command === commandsMapping.ZOOM_IN) {
      if (this.lastZoomPayload !== null) {
        this.lastZoomPayload.args.x = payload.args.x;
        this.lastZoomPayload.args.y = payload.args.y;
        (this.lastZoomPayload.args.zoomFactor as number) *= payload.args
          .zoomFactor as number;
      } else {
        queueItem = { payload, promise: new Deferred() };
        this.lastZoomPayload = payload;
        this.payloadDataQueue.push(queueItem);
      }
      this.lastMouseMovePayload = null;
      this.lastModelMoveToPayload = null;
    } else {
      this.lastMouseMovePayload = null;
      this.lastModelMoveToPayload = null;
      this.lastZoomPayload = null;
      queueItem = { payload, promise: new Deferred() };
      this.payloadDataQueue.push(queueItem);
    }
    if (shouldProcessQueue) {
      // Control will come here when a new command comes after the whole queue was processed
      await this.processCommandsInQueue();
    }

    if (queueItem) {
      return queueItem.promise.promise;
    }
    return null;
  }

  private static async handleMinskyPayload(
    payload: MinskyProcessPayload
  ): Promise<unknown> {
    let res = null;

    switch (payload.command) {
      case commandsMapping.RECORD:
        await RecordingManager.handleRecord();
        break;

      case commandsMapping.RECORDING_REPLAY:
        await RecordingManager.handleRecordingReplay();
        break;

      case commandsMapping.AVAILABLE_OPERATIONS_MAPPING:
        res = this.availableOperationsMappings;
        break;

      default:
        res = await this.executeCommandOnMinskyServer(payload);
        break;
    }
    await this.resumeQueueProcessing();
    return res;
  }

  public static onCurrentTab(command: string, ...args)
  {
    callRESTApi(`${this.currentTab}/${command} ${JSON5.stringify(...args)}`);
  }
  
  private static async executeCommandOnMinskyServer(
    payload: MinskyProcessPayload
  ): Promise<unknown> {
    let stdinCommand = null;

    if (!this.canvasReady && this.getRenderCommand()) {
      callRESTApi(this.getRenderCommand());
      this.canvasReady=true;
    }
    
    switch (payload.command) {
    case commandsMapping.LOAD:
      stdinCommand = `${payload.command} ${JSON5.stringify(payload.filePath)}`;
      this.currentMinskyModelFilePath = payload.filePath;
      break;

    case commandsMapping.SAVE:
        stdinCommand = `${payload.command} ${JSON5.stringify(payload.filePath)}`;
        this.currentMinskyModelFilePath = payload.filePath;
        ipcMain.emit(events.ADD_RECENT_FILE, null, payload.filePath);
      break;

    case commandsMapping.MOVE_TO:
      stdinCommand = `${payload.command} [${payload.mouseX}, ${payload.mouseY}]`;
      break;
        
    case commandsMapping.MOUSEMOVE_SUBCOMMAND:
    case commandsMapping.MOVE_TO_SUBCOMMAND:
    case commandsMapping.MOUSEDOWN_SUBCOMMAND:
    case commandsMapping.MOUSEUP_SUBCOMMAND:
    case 'position':
      stdinCommand = `${this.currentTab}/${payload.command} [${payload.mouseX}, ${payload.mouseY}]`;
      break;
      
      
    case commandsMapping.ZOOM_IN:
      stdinCommand = `${this.currentTab}/zoom [${payload.args.x}, ${payload.args.y}, ${payload.args.zoomFactor}]`;
      break;
      
    case commandsMapping.SET_GODLEY_ICON_RESOURCE:
      // eslint-disable-next-line no-case-declarations
      const godleyIconFilePath = normalizeFilePathForPlatform(
        Utility.isDevelopmentMode()
          ? `${join(__dirname, 'assets/godley.svg')}`
          : `${join(process.resourcesPath, 'assets/godley.svg')}`
      );
      stdinCommand = `${payload.command} ${godleyIconFilePath}`;
      
      break;
      
    case commandsMapping.SET_GROUP_ICON_RESOURCE:
      // eslint-disable-next-line no-case-declarations
      const groupIconFilePath = normalizeFilePathForPlatform(
        Utility.isDevelopmentMode()
          ? `${join(__dirname, 'assets/group.svg')}`
          : `${join(process.resourcesPath, 'assets/group.svg')}`
      );
      
      stdinCommand = `${payload.command} ${groupIconFilePath}`;
      break;
      
    case commandsMapping.SET_LOCK_ICON_RESOURCE:
      // eslint-disable-next-line no-case-declarations
      const lockIconFilePath = normalizeFilePathForPlatform(
        Utility.isDevelopmentMode()
          ? `${join(__dirname, 'assets/locked.svg')}`
          : `${join(process.resourcesPath, 'assets/locked.svg')}`
      );
      
      // eslint-disable-next-line no-case-declarations
      const unlockIconFilePath = normalizeFilePathForPlatform(
        Utility.isDevelopmentMode()
          ? `${join(__dirname, 'assets/unlocked.svg')}`
          : `${join(process.resourcesPath, 'assets/unlocked.svg')}`
      );
      
      stdinCommand = `${payload.command} [${lockIconFilePath},${unlockIconFilePath}]`;
      break;
      
    case commandsMapping.REQUEST_REDRAW_SUBCOMMAND:
      stdinCommand = this.getRequestRedrawCommand();
      break;
      
    case commandsMapping.RENDER_FRAME_SUBCOMMAND:
      stdinCommand = this.getRenderCommand();
      break;
      
    default:
      stdinCommand = payload.command;
      break;
    }
    if (stdinCommand) {
      if (RecordingManager.isRecording) {
        RecordingManager.record(stdinCommand);
      }

      return callRESTApi(stdinCommand);
    }
    log.error('Command was null or undefined');
  }

  private static getRequestRedrawCommand(tab?: MainRenderingTabs) {
    if (!tab) {
      tab = this.currentTab;
    }
    return `${tab}/${commandsMapping.REQUEST_REDRAW_SUBCOMMAND}`;
  }

  private static getRenderCommand(tab?: MainRenderingTabs) {
    const {
      leftOffset,
      canvasWidth,
      canvasHeight,
      activeWindows,
      electronTopOffset,
      scaleFactor,
    } = WindowManager;

    if (!tab) {
      tab = this.currentTab;
    }

    if (!canvasHeight || !canvasWidth) {
      return null;
    }

    const mainWindowId = activeWindows.get(1).systemWindowId;
    const renderCommand = `${tab}/${
      commandsMapping.RENDER_FRAME_SUBCOMMAND
    } [${mainWindowId},${leftOffset},${electronTopOffset},${canvasWidth},${canvasHeight}, ${scaleFactor.toPrecision(
      5
    )}]`; // TODO:: Remove this and fix backend to accept integer values
    return renderCommand;
  }

  static async setGodleyPreferences() {
    const preferences: MinskyPreferences = StoreManager.store.get(
      'preferences'
    );
    await this.handleMinskyProcess({
      command: `${commandsMapping.MULTIPLE_EQUITIES} ${preferences.enableMultipleEquityColumns}`,
    });
    await this.handleMinskyProcess({
      command: `${commandsMapping.SET_GODLEY_DISPLAY_VALUE} [${preferences.godleyTableShowValues},"${preferences.godleyTableOutputStyle}"]`,
    });
  }

  static async startMinskyService(showServiceStartedDialog = false) {
    const scope = this;
    const initPayload: MinskyProcessPayload = {
      command: commandsMapping.START_MINSKY_PROCESS,
      showServiceStartedDialog,
    };

    
    await scope.handleMinskyProcess(initPayload);

    const setGroupIconResource = async () => {
      const groupIconResourcePayload: MinskyProcessPayload = {
        command: commandsMapping.SET_GROUP_ICON_RESOURCE,
      };

      await scope.handleMinskyProcess(groupIconResourcePayload);
    };

    const setGodleyIconResource = async () => {
      const godleyIconPayload: MinskyProcessPayload = {
        command: commandsMapping.SET_GODLEY_ICON_RESOURCE,
      };

      await scope.handleMinskyProcess(godleyIconPayload);
    };

    const setLockIconResource = async () => {
      const lockIconPayload: MinskyProcessPayload = {
        command: commandsMapping.SET_LOCK_ICON_RESOURCE,
      };

      await scope.handleMinskyProcess(lockIconPayload);
    };

    setTimeout(async () => {
      await setGodleyIconResource();
      await setGroupIconResource();
      await setLockIconResource();
      await scope.setGodleyPreferences();
    }, 100);
  }
}
