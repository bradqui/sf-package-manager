import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SfdxProject, PackageDirectory } from '../models/package';
import { Logger } from '../utils/logger';

export class ProjectService {
  private cachedProject: SfdxProject | null = null;
  private projectPath: string | null = null;

  async hasSfdxProject(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    for (const folder of workspaceFolders) {
      const sfdxProjectPath = path.join(folder.uri.fsPath, 'sfdx-project.json');
      if (fs.existsSync(sfdxProjectPath)) {
        this.projectPath = sfdxProjectPath;
        return true;
      }
    }

    return false;
  }

  async getProject(): Promise<SfdxProject | null> {
    if (this.cachedProject) {
      return this.cachedProject;
    }

    const hasSfdxProject = await this.hasSfdxProject();
    if (!hasSfdxProject || !this.projectPath) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.projectPath, 'utf-8');
      this.cachedProject = JSON.parse(content) as SfdxProject;
      Logger.info(`Loaded sfdx-project.json from ${this.projectPath}`);
      return this.cachedProject;
    } catch (error) {
      Logger.error(`Failed to parse sfdx-project.json: ${error}`);
      return null;
    }
  }

  async getPackageDirectories(): Promise<PackageDirectory[]> {
    const project = await this.getProject();
    return project?.packageDirectories || [];
  }

  async getPackageAliases(): Promise<Record<string, string>> {
    const project = await this.getProject();
    return project?.packageAliases || {};
  }

  async getNamespace(): Promise<string | undefined> {
    const project = await this.getProject();
    return project?.namespace;
  }

  async getDefaultPackageDirectory(): Promise<PackageDirectory | null> {
    const directories = await this.getPackageDirectories();
    const defaultDir = directories.find(dir => dir.default);
    return defaultDir || (directories.length > 0 ? directories[0] : null);
  }

  async getProjectName(): Promise<string | null> {
    const project = await this.getProject();
    return project?.name || null;
  }

  clearCache(): void {
    this.cachedProject = null;
  }

  getProjectPath(): string | null {
    return this.projectPath;
  }

  getWorkspacePath(): string | null {
    if (this.projectPath) {
      return path.dirname(this.projectPath);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }

    return null;
  }

  getWorkspaceRoot(): string | null {
    return this.getWorkspacePath();
  }
}
