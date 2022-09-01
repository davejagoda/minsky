import {
  availableOperations,
  commandsMapping,
  electronMenuBarHeightForWindows,
  isWindows,
  normalizeFilePathForPlatform,
} from '@minsky/shared';
import * as debug from 'debug';
import {
  dialog,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  SaveDialogOptions,
  shell,
} from 'electron';
import * as JSON5 from 'json5';
import { CommandsManager } from './CommandsManager';
import { RestServiceManager, callRESTApi } from './RestServiceManager';
import { StoreManager } from './StoreManager';
import { WindowManager } from './WindowManager';
import { BookmarkManager } from './BookmarkManager';

const logError = debug('minsky:electron_error');

//TODO:: Remove hardcoding of popup dimensions

export class ApplicationMenuManager {
  public static createMainApplicationMenu() {
    const scope = this;
    const menu = Menu.buildFromTemplate([
      scope.getFileMenu(),
      scope.getEditMenu(),
      scope.getBookmarksMenu(),
      scope.getInsertMenu(),
      scope.getOptionsMenu(),
      scope.getSimulationMenu(),
      scope.getHelpMenu(),
    ]);

    Menu.setApplicationMenu(menu);
    return menu;
  }

  private static getFileMenu(): MenuItemConstructorOptions {
    const scope = this;
    return {
      label: 'File',
      submenu: [
        {
          label: 'About Minsky',
          click() {
            WindowManager.createPopupWindowWithRouting({
              width: 420,
              height: 500,
              title: '',
              url: `#/headless/menu/file/about`,
            });
            shell.beep();
          },
        },
        {
          label: 'Upgrade',
          click() {
            shell.openExternal('https://www.patreon.com/hpcoder');
          },
        },
        {
          label: 'New System',
          accelerator: 'CmdOrCtrl + Shift + N',
          async click() {
              await CommandsManager.createNewSystem();
              BookmarkManager.updateBookmarkList();
          },
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl + O',
          enabled: true,
          async click() {
            try {
              const _dialog = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [
                  { name: '*.mky', extensions: ['mky'] },
                  { name: '*.rvl', extensions: ['rvl'] },
                  { name: '*.xml', extensions: ['xml'] },
                  { name: '*.*', extensions: ['*'] },
                ],
              });

              if (_dialog.canceled || !_dialog.filePaths) {
                return;
              }
              const filePath = _dialog.filePaths[0].toString();

              await CommandsManager.openNamedFile(filePath);
            } catch (error) {
              logError(error);
            }
              BookmarkManager.updateBookmarkList();
          },
        },
        {
          label: 'Open Recent',
          id: 'openRecent',
          submenu: [
            { type: 'separator' },
            {
              label: 'Clear Recent',
              id: 'clearRecent',
              click: () => {
                StoreManager.store.set('recentFiles', []);
                Menu.getApplicationMenu()
                  .getMenuItemById('openRecent')
                  .submenu.items.forEach((i) => {
                    if (i.id !== 'clearRecent') {
                      i.visible = false;
                    }
                  });
              },
            },
          ],
        },
        {
          label: 'Library',
          click() {
            shell.openExternal(
              'https://github.com/highperformancecoder/minsky-models'
            );
          },
        },
        {
            label: 'Save',
            accelerator: 'CmdOrCtrl + S',
            async click() {await CommandsManager.save();}
        },
        {
            label: 'Save As',
            accelerator: 'CmdOrCtrl + Shift + S',
            async click() {await CommandsManager.saveAs();}
        },
        {
          label: 'Insert File as Group',
          async click() {
            try {
              const insertGroupDialog = await dialog.showOpenDialog({
                properties: ['openFile'],
              });

              const filePath = normalizeFilePathForPlatform(
                insertGroupDialog.filePaths[0].toString()
              );

              await RestServiceManager.handleMinskyProcess({
                command: `${commandsMapping.INSERT_GROUP_FROM_FILE} ${filePath}`,
              });
              await CommandsManager.requestRedraw();
            } catch (err) {
              logError('file is not selected', err);
            }
          },
        },
        {
          label: 'Dimensional Analysis',
          click: async () => {
            const res = await RestServiceManager.handleMinskyProcess({
              command: commandsMapping.DIMENSIONAL_ANALYSIS,
            });

            if (JSON5.stringify(res) === JSON5.stringify({})) {
              dialog.showMessageBoxSync(WindowManager.getMainWindow(), {
                type: 'info',
                title: 'Dimensional Analysis',
                message: 'Dimensional Analysis Passed',
              });
            }
          },
        },
        scope.getExportCanvasMenu(),
        scope.getExportPlotMenu(),
        {
          label: 'Log simulation',
          click() {
            WindowManager.createPopupWindowWithRouting({
              width: 250,
              height: 600,
              title: 'Log simulation',
              url: `#/headless/menu/file/log-simulation`,
            });
          },
        },
        {
          label: 'Recording',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: commandsMapping.RECORD,
            });
          },
        },
        {
          label: 'Replay recording',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: commandsMapping.RECORDING_REPLAY,
            });
          },
        },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl + Q',
          role: 'quit',
        },
        {
          type: 'separator',
        },
        {
          label: 'Debugging Use',
          enabled: false,
        },
        {
          label: 'Redraw',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              //command: commandsMapping.REQUEST_REDRAW_SUBCOMMAND,
              command: commandsMapping.RENDER_FRAME_SUBCOMMAND,
            });
          },
        },
      ],
    };
  }

  private static getEditMenu(): MenuItemConstructorOptions {
    return {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl + Z',
          async click() {CommandsManager.undo(1);},
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl + Y',
          async click() {CommandsManager.undo(-1);},
        },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl + X',
          async click() {
            await CommandsManager.cut();
          },
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl + C',
          async click() {
            await CommandsManager.copy();
          },
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl + V',
          async click() {
            await CommandsManager.paste();
          },
        },
        {
          label: 'Group selection',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.GROUP_SELECTION}`,
            });
          },
        },
        {
          label: 'Dimensions',
          click() {
            WindowManager.createPopupWindowWithRouting({
              width: 700,
              height: 500,
              title: 'Dimensions',
              url: `#/headless/menu/edit/dimensions`,
            });
          },
        },
        {
          label: 'Remove Units',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.REMOVE_UNITS}`,
            });
          },
        },
        {
          label: 'Auto Layout',
          async click() {
            WindowManager.getMainWindow().webContents.insertCSS(
              `body { cursor: wait; }`
            );
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.AUTO_LAYOUT}`,
            });
            WindowManager.getMainWindow().webContents.insertCSS(
              `body { cursor: default; }`
            );
          },
        },
        {
          label: 'Random Layout',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.RANDOM_LAYOUT}`,
            });
          },
        },
      ],
    };
  }

  private static getInsertMenu(): MenuItemConstructorOptions {
    return {
      label: 'Insert',
      id: 'insert',
      submenu: [
        {
          label: 'plot',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: commandsMapping.ADD_PLOT,
            });
          },
        },
        {
          label: 'Godley Table',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: commandsMapping.ADD_GODLEY,
            });
          },
        },
        {
          label: 'Variable',
          submenu: [
            {
              type: 'separator',
            },
            {
              label: 'variable',
              click() {
                WindowManager.createPopupWindowWithRouting({
                  width: 500,
                  height: 650,
                  title: 'Specify variable name',
                  url: `#/headless/menu/insert/create-variable?type=flow`,
                });
              },
            },
            {
              label: 'constant',
              click() {
                WindowManager.createPopupWindowWithRouting({
                  width: 500,
                  height: 650,
                  title: 'Specify variable name',
                  url: `#/headless/menu/insert/create-variable?type=constant`,
                });
              },
            },
            {
              label: 'parameter',
              click() {
                WindowManager.createPopupWindowWithRouting({
                  width: 500,
                  height: 650,
                  title: 'Specify variable name',
                  url: `#/headless/menu/insert/create-variable?type=parameter`,
                });
              },
            },
          ],
        },
        {
          label: 'time',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.ADD_OPERATION} "${availableOperations.TIME}"`,
            });
          },
        },
        {
          label: 'integrate',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.ADD_OPERATION} "${availableOperations.INTEGRATE}"`,
            });
          },
        },
        {
          label: 'differentiate',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.ADD_OPERATION} "${availableOperations.DIFFERENTIATE}"`,
            });
          },
        },
        {
          label: 'data',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: `${commandsMapping.ADD_OPERATION} "${availableOperations.DATA}"`,
            });
          },
        },
        {
          label: 'ravel',
          async click() {
            await RestServiceManager.handleMinskyProcess({
              command: commandsMapping.ADD_RAVEL,
            });
          },
        },
      ],
    };
  }

  private static getBookmarksMenu(): MenuItemConstructorOptions {
    return {
      label: 'Bookmarks',
      id: 'main-bookmark',
      submenu: [
        {
          label: 'Bookmark this position',
          click() {
            CommandsManager.bookmarkThisPosition();
          },
        },
        {
          label: 'Delete bookmark',
          id: 'delete-bookmark',
          submenu: [],
        },
        { type: 'separator' },
      ],
    };
  }

  private static async exportCanvas(
    extension: string,
    command: string,
    extraArgs: Array<any> = []
  ) {
    var filePath = await CommandsManager.getFilePathFromExportCanvasDialog(
      extension
    );
    if (filePath) {
      const args =
        extraArgs.length > 0
          ? `[${filePath}, ${extraArgs.join(',')}]`
          : filePath;
      await RestServiceManager.handleMinskyProcess({
        command: `${command} ${args}`,
      });
    }
  }

  private static getExportCanvasMenu(): MenuItemConstructorOptions {
    const scope = this;
    return {
      label: 'Export Canvas as',
      submenu: [
        {
          label: 'SVG',
          click: async () => {
            await scope.exportCanvas(
                'svg',
                `${RestServiceManager.getCurrentTab()}/renderToSVG`
            );
          },
        },
        {
          label: 'PDF',
          click: async () => {
            await scope.exportCanvas(
                'pdf',
                `${RestServiceManager.getCurrentTab()}/renderToPDF`
            );
          },
        },
        {
          label: 'EMF',
          visible: isWindows(),
          click: async () => {
            await scope.exportCanvas(
                'emf',
                `${RestServiceManager.getCurrentTab()}/renderToEMF`
            );
          },
        },
        {
          label: 'PostScript',
          click: async () => {
            await scope.exportCanvas(
                'eps',
                `${RestServiceManager.getCurrentTab()}/renderToPS`
            );
          },
        },
        {
          label: 'LaTeX',
          click: async () => {
            await scope.exportCanvas('tex', commandsMapping.LATEX, [
              StoreManager.store.get('preferences')
                .wrapLongEquationsInLatexExport,
            ]);
          },
        },
        {
          label: 'Matlab',
          click: async () => {
            await scope.exportCanvas('m', commandsMapping.MATLAB);
          },
        },
      ],
    };
  }

  private static async exportPlot(extension: string, command: string) {
    const exportPlotDialog = await dialog.showSaveDialog({
      title: `Export plot as ${extension}`,
      defaultPath: 'plot',
      properties: ['showOverwriteConfirmation', 'createDirectory'],
      filters: [{ extensions: [extension], name: extension.toUpperCase() }],
    });

    const { canceled, filePath: _filePath } = exportPlotDialog;
    if (canceled) {
      return;
    }
    const filePath = normalizeFilePathForPlatform(_filePath);
    if (!filePath) {
      return;
    }
    await RestServiceManager.handleMinskyProcess({
      command: `${command} ${filePath}`,
    });
  }

  private static getExportPlotMenu(): MenuItemConstructorOptions {
    const scope = this;
    return {
      label: 'Export Plots as',
      submenu: [
        {
          label: 'SVG',
          async click() {
            await scope.exportPlot(
              'svg',
              commandsMapping.RENDER_ALL_PLOTS_AS_SVG
            );
          },
        },
        {
          label: 'CSV',
          async click() {
            await scope.exportPlot(
              'csv',
              commandsMapping.EXPORT_ALL_PLOTS_AS_CSV
            );
          },
        },
      ],
    };
  }

  private static getOptionsMenu(): MenuItemConstructorOptions {
    return {
      label: 'Options',
      submenu: [
        {
          label: 'Preferences',
          click() {
            WindowManager.createPopupWindowWithRouting({
              width: 500,
              useContentSize: true,
              height: 550+(isWindows()? electronMenuBarHeightForWindows:0),
              title: 'Preferences',
              url: `#/headless/menu/options/preferences`,
            });
          },
        },
        {
          label: 'Background Colour',
          click() {
            WindowManager.createPopupWindowWithRouting({
              width: 450,
              height: 620,
              title: 'Background Colour',
              url: `#/headless/menu/options/background-color`,
            });
          },
        },
      ],
    };
  }

  private static getSimulationMenu(): MenuItemConstructorOptions {
    return {
      label: 'Simulation',
      submenu: [
        {
          label: 'Simulation',
          click() {
            WindowManager.createPopupWindowWithRouting({
              width: 550,
              height: 550,
              title: 'Simulation',
              url: `#/headless/menu/simulation/simulation-parameters`,
            });
          },
        },
      ],
    };
  }

  private static getHelpMenu(): MenuItemConstructorOptions {
    return {
      role: 'help',
      submenu: [
        {
          label: 'Minsky Documentation',
          click() {
            shell.openExternal(
              'https://minsky.sourceforge.io/manual/minsky.html'
            );
          },
        },
      ],
    };
  }

  private static buildSubmenuForOperations(operations: string[]) {
    const submenu: MenuItemConstructorOptions[] = [];
    for (const o of operations) {
      submenu.push(this.addOpMenu(o));
    }
    return submenu;
  }

  private static addOpMenu(operation: string) {
    return {
      label: operation,
      async click() {
        await RestServiceManager.handleMinskyProcess({
          command: `${commandsMapping.ADD_OPERATION} "${operation}"`,
        });
      },
    };
  }
  static async buildMenuForInsertOperations() {
    const availableOperationsMapping = await CommandsManager.getAvailableOperationsMapping();
    let insertOperationsMenu: MenuItem[] = [];
    for (const key in availableOperationsMapping) {
      insertOperationsMenu = [
        ...insertOperationsMenu,
        new MenuItem({
          label: key,
          submenu: this.buildSubmenuForOperations(
            availableOperationsMapping[key]
          ),
        }),
      ];
    }

    const insertMenu = Menu.getApplicationMenu().getMenuItemById('insert');

    insertOperationsMenu.forEach((o) => {
      insertMenu.submenu.append(o);
    });
  }
}