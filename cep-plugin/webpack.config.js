const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  const isPreview = !!env?.preview;

  return {
    entry: './src/index.tsx',
    target: isPreview ? 'web' : 'node',
    output: {
      path: path.resolve(__dirname, isPreview ? 'preview-dist' : 'dist'),
      filename: 'index.js',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      fallback: isPreview ? {
        crypto: false,
        path:   false,
        buffer: false,
        stream: false,
        fs:     false,
        os:     false,
        vm:     false,
        child_process: false,
      } : {},
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
          type: 'asset/inline',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
        filename: 'index.html',
        inject: 'body',
      }),
    ],
    devtool: isDev ? 'inline-source-map' : false,
    // In CEP (node target) require() maps to Node built-ins.
    // In browser preview (web target) we use resolve.fallback polyfills instead.
    externals: isPreview ? {} : {
      fs: 'commonjs fs',
      path: 'commonjs path',
      os: 'commonjs os',
      crypto: 'commonjs crypto',
      child_process: 'commonjs child_process',
    },
  };
};
