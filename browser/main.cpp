#include <iostream>
extern "C" {
  int add(int a, int b) {
    return a + b;
  }
}
int main() {
  std::cout << "Hello from C++ compiled to WebAssembly!\n";
  return 0;
}
