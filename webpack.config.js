const path = require('path');
const fs = require('fs');

/**
 * Copies static webview assets (stylesheet, codicon font) into dist/webview.
 * Avoids pulling in css-loader/copy-webpack-plugin for a handful of files.
 */
class CopyWebviewAssetsPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyWebviewAssetsPlugin', () => {
      const assets = [
        ['src/webview/dashboard/dashboard.css', 'dist/webview/dashboard.css'],
        ['node_modules/@vscode/codicons/dist/codicon.css', 'dist/webview/codicons/codicon.css'],
        ['node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/webview/codicons/codicon.ttf']
      ];
      for (const [from, to] of assets) {
        const target = path.resolve(__dirname, to);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.resolve(__dirname, from), target);
      }
    });
  }
}

/** Extension host code (Node) */
const extensionConfig = {
  name: 'extension',
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: 'log'
  }
};

/** Dashboard webview app (browser) */
const webviewConfig = {
  name: 'webview',
  target: 'web',
  mode: 'none',
  entry: {
    dashboard: './src/webview/dashboard/main.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'src/webview/tsconfig.json')
            }
          }
        ]
      }
    ]
  },
  plugins: [new CopyWebviewAssetsPlugin()],
  devtool: 'nosources-source-map',
  performance: {
    hints: false
  }
};

module.exports = [extensionConfig, webviewConfig];
