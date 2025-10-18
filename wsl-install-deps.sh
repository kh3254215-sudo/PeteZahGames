#!/bin/bash
set -euo pipefail

echo "Running WSL dependency installer..."

# Detect distro
if [ -f /etc/os-release ]; then
  . /etc/os-release
  DISTRO=$ID
else
  DISTRO="unknown"
fi

# Helper to check if a command exists
has() {
  command -v "$1" >/dev/null 2>&1
}

# Install a package if missing
install_pkg() {
  local pkg=$1

  case "$DISTRO" in
    ubuntu|debian)
      if dpkg -s "$pkg" >/dev/null 2>&1; then
        echo "$pkg already installed"
      else
        echo "Installing $pkg..."
        sudo apt-get update && sudo apt-get install -y "$pkg"
      fi
      ;;

    fedora)
      if rpm -q "$pkg" >/dev/null 2>&1; then
        echo "$pkg already installed"
      else
        echo "Installing $pkg..."
        sudo dnf install -y "$pkg"
      fi
      ;;

    arch)
      if pacman -Qi "$pkg" >/dev/null 2>&1; then
        echo "$pkg already installed"
      else
        echo "Installing $pkg..."
        sudo pacman -Sy --noconfirm "$pkg"
      fi
      ;;

    *)
      echo "Unknown distro: $DISTRO. Please install $pkg manually."
      ;;
  esac
}


# Install base dependencies
for dep in git curl build-essential; do
  install_pkg "$dep"
done

# Install NVM and Node 22+
if ! has nvm; then
  echo "Installing NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
fi

echo "Installing Node.js 22 via NVM..."
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22


# Install pnpm globally
if ! has pnpm; then
  echo "Installing pnpm..."
  npm install -g pnpm
  pnpm setup
  source ~/.bashrc
fi

# Install rspack, typescript, rslib globally
pnpm add -g @rspack/cli typescript @rslib/core

# Install Rust if missing
if ! has cargo; then
  echo "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  rustup install nightly
  source "$HOME/.cargo/env"
fi
rustup install nightly
# Install wasm-bindgen and wasm-snip
WBG="wasm-bindgen 0.2.100"
if ! [[ "$(wasm-bindgen -V)" =~ ^"$WBG" ]]; then
	cargo install wasm-bindgen-cli --force --version=0.2.100 --locked
else
  echo "wasm-bindgen-cli is already at the required version."
fi
cargo install --git https://github.com/r58Playz/wasm-snip --locked

if ! grep -q 'export PATH="$HOME/.cargo/bin:$PATH"' "$HOME/.bashrc"; then
  echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> "$HOME/.bashrc"
  echo 'Added ~/.cargo/bin to PATH in .bashrc'
else
  echo '$HOME/.cargo/bin is already in PATH in .bashrc'
fi
# Install Binaryen (wasm-opt)
install_pkg binaryen

echo "All WSL dependencies installed successfully!"
