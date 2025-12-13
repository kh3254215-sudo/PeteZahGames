#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

function has(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

function installLinux(pkg) {
  const distro = fs.existsSync('/etc/os-release') ? fs.readFileSync('/etc/os-release', 'utf8') : '';
  if (/ubuntu|debian/i.test(distro)) {
    run(`sudo apt-get update && sudo apt-get install -y ${pkg}`);
  } else if (/fedora/i.test(distro)) {
    run(`sudo dnf install -y ${pkg}`);
  } else if (/arch/i.test(distro)) {
    run(`sudo pacman -Sy --noconfirm ${pkg}`);
  } else {
    console.warn(`Unknown distro, please install ${pkg} manually`);
  }
}

function installMac(pkg) {
  if (!has('brew')) {
    console.log('Installing Homebrew...');
    run('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
  }
  run(`brew install ${pkg}`);
}

function installRustTools() {
  if (!has('cargo')) {
    console.log('Installing Rust (cargo)...');
    run("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y");
    run('source $HOME/.cargo/env');
  }
  const WBG = 'wasm-bindgen 0.2.100';
  const WBGtest = execSync(`wasm-bindgen -V`, { stdio: 'ignore', shell: true });
  if (WBG === WBGtest) {
    console.log('Installing wasm-bindgen-cli...');
    run('cargo install wasm-bindgen-cli --version=0.2.104 --locked');
  } else {
    console.log('Installing wasm-bindgen-cli...');
    run('cargo install wasm-bindgen-cli --version=0.2.104  --force --locked');
  }
  console.log('Installing wasm-snip from GitHub...');
  run('cargo install --git https://github.com/r58Playz/wasm-snip --locked');
  run('cargo rustc -Zunstable-options -Cpanic=immediate-abort');
}

function installBinaryen() {
  console.log('Installing Binaryen (wasm-opt)...');
  if (os.platform() === 'darwin') {
    installMac('binaryen');
  } else {
    installLinux('binaryen');
  }
}
function installDepsUnix() {
  const platform = os.platform();
  console.log(`Detected platform: ${platform}`);

  if (platform === 'linux') {
    ['git', 'curl'].forEach(installLinux);

    if (!has('nvm')) {
      console.log('Installing NVM...');
      run('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash');
      run('export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"');
    }

    console.log('Installing Node.js 22 via NVM...');
    run('export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm install 22 && nvm use 22');
  } else if (platform === 'darwin') {
    ['git', 'curl'].forEach(installMac);
    if (!has('nvm')) {
      console.log('Installing NVM...');
      run('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash');
      run('export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"');
    }

    console.log('Installing Node.js 22 via NVM...');
    run('export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm install 22 && nvm use 22');
  } else {
    console.error('Unsupported OS for this script');
    process.exit(1);
  }

  if (!has('pnpm')) {
    run('npm install -g pnpm');
  }

  run('pnpm add -g @rspack/cli typescript @rslib/core');

  installRustTools();
  installBinaryen();
  console.log('All dependencies installed successfully!');
}

function main() {
  const platform = os.platform();

  if (platform === 'win32') {
    // Running on Windows outside WSL
    if (has('wsl')) {
      console.log('Windows detected. Running dependency install inside WSL...');
      run(`wsl bash -ic "bash ./wsl-install-deps.sh"`);
    } else {
      console.error('WSL not detected. Please install WSL first\nMore information can be found at https://aka.ms/wslinstall.');
      process.exit(1);
    }
  } else {
    // Linux/macOS/WSL
    installDepsUnix();
  }
}

main();
