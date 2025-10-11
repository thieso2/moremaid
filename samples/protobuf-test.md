# Protobuf Syntax Test

This tests that Protobuf syntax highlighting is working with the autoloader.

```protobuf
syntax = "proto3";

package tutorial;

option java_package = "com.example.tutorial";
option java_outer_classname = "AddressBookProtos";

message Person {
  string name = 1;
  int32 id = 2;
  string email = 3;

  enum PhoneType {
    MOBILE = 0;
    HOME = 1;
    WORK = 2;
  }

  message PhoneNumber {
    string number = 1;
    PhoneType type = 2;
  }

  repeated PhoneNumber phones = 4;
}

message AddressBook {
  repeated Person people = 1;
}
```

## Other languages to verify autoloader

```python
def hello():
    print("Python works!")
```

```rust
fn main() {
    println!("Rust works!");
}
```

```graphql
type Query {
  user(id: ID!): User
}
```
