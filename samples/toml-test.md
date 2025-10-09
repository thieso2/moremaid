# TOML Syntax Highlighting Test

This document tests TOML syntax highlighting support in Moremaid.

## Basic TOML Configuration

```toml
# This is a TOML document

title = "TOML Example"

[owner]
name = "Tom Preston-Werner"
dob = 1979-05-27T07:32:00-08:00

[database]
enabled = true
ports = [ 8000, 8001, 8002 ]
data = [ ["delta", "phi"], [3.14] ]
temp_targets = { cpu = 79.5, case = 72.0 }

[servers]

[servers.alpha]
ip = "10.0.0.1"
role = "frontend"

[servers.beta]
ip = "10.0.0.2"
role = "backend"
```

## Package Configuration (Cargo.toml)

```toml
[package]
name = "moremaid"
version = "1.10.2"
edition = "2021"
authors = ["Your Name <you@example.com>"]
description = "A markdown viewer with Mermaid support"
license = "MIT"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }

[dev-dependencies]
criterion = "0.5"

[[bin]]
name = "mm"
path = "src/main.rs"
```

## Python Project (pyproject.toml)

```toml
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "example-project"
version = "0.1.0"
description = "An example Python project"
readme = "README.md"
requires-python = ">=3.8"
license = {text = "MIT"}
keywords = ["example", "tutorial"]
authors = [
  {name = "John Doe", email = "john@example.com"}
]
classifiers = [
  "Development Status :: 3 - Alpha",
  "Intended Audience :: Developers",
  "License :: OSI Approved :: MIT License",
  "Programming Language :: Python :: 3",
]

dependencies = [
  "requests>=2.28.0",
  "click>=8.0.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=7.0",
  "black>=22.0",
]

[project.urls]
Homepage = "https://example.com"
Documentation = "https://docs.example.com"
Repository = "https://github.com/user/repo"

[tool.pytest.ini_options]
minversion = "7.0"
addopts = "-ra -q"
testpaths = [
    "tests",
]

[tool.black]
line-length = 88
target-version = ['py38']
```

## Comparison with Other Formats

### YAML equivalent

```yaml
database:
  enabled: true
  ports:
    - 8000
    - 8001
    - 8002
```

### JSON equivalent

```json
{
  "database": {
    "enabled": true,
    "ports": [8000, 8001, 8002]
  }
}
```

### TOML version

```toml
[database]
enabled = true
ports = [ 8000, 8001, 8002 ]
```
