pub struct Stack<T> {
    elements: Vec<T>,
}

impl<T> Stack<T> {
    pub fn new() -> Self {
        Stack { elements: Vec::new() }
    }

    pub fn push(&mut self, item: T) {
        self.elements.push(item);
    }

    pub fn pop(&mut self) -> Option<T> {
        self.elements.pop()
    }

    pub fn peek(&self) -> Option<&T> {
        self.elements.last()
    }

    pub fn is_empty(&self) -> bool {
        self.elements.is_empty()
    }

    pub fn len(&self) -> usize {
        self.elements.len()
    }
}

pub trait Printable {
    fn display(&self) -> String;
}

impl Printable for Stack<i32> {
    fn display(&self) -> String {
        format!("Stack({:?})", self.elements)
    }
}

pub fn create_stack() -> Stack<i32> {
    Stack::new()
}

pub fn reverse_stack<T>(stack: &mut Stack<T>) -> Vec<T> {
    let mut result = Vec::new();
    while let Some(item) = stack.pop() {
        result.push(item);
    }
    result
}
