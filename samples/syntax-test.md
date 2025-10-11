# Syntax Highlighting Test

## Protobuf

```protobuf
syntax = "proto3";

package example;

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

service UserService {
  rpc GetUser (UserRequest) returns (Person);
  rpc ListUsers (ListUsersRequest) returns (stream Person);
}
```

## GraphQL

```graphql
type Query {
  user(id: ID!): User
  posts(limit: Int = 10): [Post!]!
}

type User {
  id: ID!
  name: String!
  email: String
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String
  author: User!
}

mutation CreatePost($title: String!, $content: String) {
  createPost(input: {
    title: $title
    content: $content
  }) {
    id
    title
  }
}
```

## Terraform

```terraform
provider "aws" {
  region = "us-west-2"
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"

  tags = {
    Name = "WebServer"
    Environment = "production"
  }
}

variable "instance_count" {
  description = "Number of instances to create"
  type        = number
  default     = 1
}

output "instance_ip" {
  value = aws_instance.web.public_ip
}
```

## Elixir

```elixir
defmodule MyApp.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :name, :string
    field :email, :string
    field :age, :integer

    timestamps()
  end

  def changeset(user, attrs) do
    user
    |> cast(attrs, [:name, :email, :age])
    |> validate_required([:name, :email])
    |> validate_format(:email, ~r/@/)
  end
end
```

## Haskell

```haskell
quicksort :: Ord a => [a] -> [a]
quicksort [] = []
quicksort (x:xs) = quicksort smaller ++ [x] ++ quicksort larger
  where
    smaller = [a | a <- xs, a <= x]
    larger  = [b | b <- xs, b > x]

factorial :: Integer -> Integer
factorial 0 = 1
factorial n = n * factorial (n - 1)
```

## R

```r
library(ggplot2)

# Create sample data
data <- data.frame(
  x = rnorm(100),
  y = rnorm(100)
)

# Create plot
ggplot(data, aes(x = x, y = y)) +
  geom_point(color = "blue", alpha = 0.6) +
  geom_smooth(method = "lm", color = "red") +
  labs(title = "Scatter Plot with Linear Regression",
       x = "X Variable",
       y = "Y Variable") +
  theme_minimal()
```

## Solidity

```solidity
pragma solidity ^0.8.0;

contract SimpleToken {
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(uint256 initialSupply) {
        balanceOf[msg.sender] = initialSupply;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}
```

## Diff

```diff
diff --git a/file.txt b/file.txt
index 123abc..456def 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
 Line 1
-Line 2 (old)
+Line 2 (new)
 Line 3
-Line 4 (removed)
+Line 4 (modified)
+Line 5 (added)
```
