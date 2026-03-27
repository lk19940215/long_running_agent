"""简单计算器模块"""


def add(a: float, b: float) -> float:
    return a + b


def subtract(a: float, b: float) -> float:
    return a - b


def multiply(a: float, b: float) -> float:
    return a * b


def divide(a: float, b: float) -> float:
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


class Calculator:
    def __init__(self):
        self.history = []

    def calc(self, op: str, a: float, b: float) -> float:
        ops = {"add": add, "sub": subtract, "mul": multiply, "div": divide}
        fn = ops.get(op)
        if not fn:
            raise ValueError(f"Unknown operation: {op}")
        result = fn(a, b)
        self.history.append({"op": op, "a": a, "b": b, "result": result})
        return result

    def last(self) -> dict:
        return self.history[-1] if self.history else None
