import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectService } from './projectService';

export interface CodeFile {
  name: string;
  type: 'lwc' | 'apex' | 'aura' | 'trigger' | 'vf';
  path: string;
  relativePath: string;
  size: number;
  modified: Date;
}

export class CodeNavigationService {
  constructor(private projectService: ProjectService) {}

  /**
   * Find all LWC components in the project
   */
  async findLWCComponents(): Promise<CodeFile[]> {
    const components: CodeFile[] = [];
    const workspaceRoot = this.projectService.getWorkspaceRoot();

    if (!workspaceRoot) {
      return components;
    }

    // Common LWC paths
    const lwcPaths = [
      path.join(workspaceRoot, 'force-app', 'main', 'default', 'lwc'),
      path.join(workspaceRoot, 'src', 'lwc')
    ];

    for (const lwcPath of lwcPaths) {
      if (fs.existsSync(lwcPath)) {
        const dirs = fs.readdirSync(lwcPath, { withFileTypes: true });

        for (const dir of dirs) {
          if (dir.isDirectory()) {
            const componentPath = path.join(lwcPath, dir.name);
            const jsFile = path.join(componentPath, `${dir.name}.js`);

            if (fs.existsSync(jsFile)) {
              const stats = fs.statSync(jsFile);
              components.push({
                name: dir.name,
                type: 'lwc',
                path: jsFile,
                relativePath: path.relative(workspaceRoot, jsFile),
                size: stats.size,
                modified: stats.mtime
              });
            }
          }
        }
      }
    }

    return components.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all Apex classes in the project
   */
  async findApexClasses(): Promise<CodeFile[]> {
    const classes: CodeFile[] = [];
    const workspaceRoot = this.projectService.getWorkspaceRoot();

    if (!workspaceRoot) {
      return classes;
    }

    // Common Apex class paths
    const apexPaths = [
      path.join(workspaceRoot, 'force-app', 'main', 'default', 'classes'),
      path.join(workspaceRoot, 'src', 'classes')
    ];

    for (const apexPath of apexPaths) {
      if (fs.existsSync(apexPath)) {
        const files = fs.readdirSync(apexPath);

        for (const file of files) {
          if (file.endsWith('.cls')) {
            const filePath = path.join(apexPath, file);
            const stats = fs.statSync(filePath);

            classes.push({
              name: file.replace('.cls', ''),
              type: 'apex',
              path: filePath,
              relativePath: path.relative(workspaceRoot, filePath),
              size: stats.size,
              modified: stats.mtime
            });
          }
        }
      }
    }

    return classes.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all Apex triggers in the project
   */
  async findApexTriggers(): Promise<CodeFile[]> {
    const triggers: CodeFile[] = [];
    const workspaceRoot = this.projectService.getWorkspaceRoot();

    if (!workspaceRoot) {
      return triggers;
    }

    // Common trigger paths
    const triggerPaths = [
      path.join(workspaceRoot, 'force-app', 'main', 'default', 'triggers'),
      path.join(workspaceRoot, 'src', 'triggers')
    ];

    for (const triggerPath of triggerPaths) {
      if (fs.existsSync(triggerPath)) {
        const files = fs.readdirSync(triggerPath);

        for (const file of files) {
          if (file.endsWith('.trigger')) {
            const filePath = path.join(triggerPath, file);
            const stats = fs.statSync(filePath);

            triggers.push({
              name: file.replace('.trigger', ''),
              type: 'trigger',
              path: filePath,
              relativePath: path.relative(workspaceRoot, filePath),
              size: stats.size,
              modified: stats.mtime
            });
          }
        }
      }
    }

    return triggers.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all Visualforce pages in the project
   */
  async findVisualforcePages(): Promise<CodeFile[]> {
    const pages: CodeFile[] = [];
    const workspaceRoot = this.projectService.getWorkspaceRoot();

    if (!workspaceRoot) {
      return pages;
    }

    // Common VF page paths
    const vfPaths = [
      path.join(workspaceRoot, 'force-app', 'main', 'default', 'pages'),
      path.join(workspaceRoot, 'src', 'pages')
    ];

    for (const vfPath of vfPaths) {
      if (fs.existsSync(vfPath)) {
        const files = fs.readdirSync(vfPath);

        for (const file of files) {
          if (file.endsWith('.page')) {
            const filePath = path.join(vfPath, file);
            const stats = fs.statSync(filePath);

            pages.push({
              name: file.replace('.page', ''),
              type: 'vf',
              path: filePath,
              relativePath: path.relative(workspaceRoot, filePath),
              size: stats.size,
              modified: stats.mtime
            });
          }
        }
      }
    }

    return pages.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all Aura components in the project
   */
  async findAuraComponents(): Promise<CodeFile[]> {
    const components: CodeFile[] = [];
    const workspaceRoot = this.projectService.getWorkspaceRoot();

    if (!workspaceRoot) {
      return components;
    }

    // Common Aura paths
    const auraPaths = [
      path.join(workspaceRoot, 'force-app', 'main', 'default', 'aura'),
      path.join(workspaceRoot, 'src', 'aura')
    ];

    for (const auraPath of auraPaths) {
      if (fs.existsSync(auraPath)) {
        const dirs = fs.readdirSync(auraPath, { withFileTypes: true });

        for (const dir of dirs) {
          if (dir.isDirectory()) {
            const componentPath = path.join(auraPath, dir.name);
            const cmpFile = path.join(componentPath, `${dir.name}.cmp`);

            if (fs.existsSync(cmpFile)) {
              const stats = fs.statSync(cmpFile);
              components.push({
                name: dir.name,
                type: 'aura',
                path: cmpFile,
                relativePath: path.relative(workspaceRoot, cmpFile),
                size: stats.size,
                modified: stats.mtime
              });
            }
          }
        }
      }
    }

    return components.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get all code files in the project
   */
  async getAllCodeFiles(): Promise<CodeFile[]> {
    const [lwc, apex, triggers, vf, aura] = await Promise.all([
      this.findLWCComponents(),
      this.findApexClasses(),
      this.findApexTriggers(),
      this.findVisualforcePages(),
      this.findAuraComponents()
    ]);

    return [...lwc, ...apex, ...triggers, ...vf, ...aura];
  }

  /**
   * Open a code file in the editor
   */
  async openFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  }

  /**
   * Search for a specific file by name
   */
  async findFileByName(fileName: string): Promise<CodeFile | null> {
    const allFiles = await this.getAllCodeFiles();
    return allFiles.find(f => f.name.toLowerCase() === fileName.toLowerCase()) || null;
  }

  /**
   * Get files in a specific package directory
   */
  async getFilesInPackageDirectory(packagePath: string): Promise<CodeFile[]> {
    const allFiles = await this.getAllCodeFiles();
    const workspaceRoot = this.projectService.getWorkspaceRoot();

    if (!workspaceRoot) {
      return [];
    }

    const fullPackagePath = path.join(workspaceRoot, packagePath);

    return allFiles.filter(file => {
      return file.path.startsWith(fullPackagePath);
    });
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  /**
   * Get icon for file type
   */
  getFileTypeIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'lwc': '⚡',
      'apex': '☁️',
      'trigger': '🔔',
      'vf': '📄',
      'aura': '🔷'
    };
    return icons[type] || '📝';
  }
}
