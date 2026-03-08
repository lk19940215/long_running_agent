const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
let todos = [];
let nextId = 1;

// Root route - API welcome message
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to TODO API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      todos: 'GET /api/todos',
      createTodo: 'POST /api/todos',
      updateTodo: 'PUT /api/todos/:id',
      deleteTodo: 'DELETE /api/todos/:id'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// GET /api/todos - Get all todos
app.get('/api/todos', (req, res) => {
  res.json(todos);
});

// POST /api/todos - Create a new todo
app.post('/api/todos', (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const todo = {
    id: nextId++,
    title,
    completed: false,
    createdAt: new Date().toISOString()
  };
  todos.push(todo);
  res.status(201).json(todo);
});

// PUT /api/todos/:id - Update todo status
app.put('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { completed } = req.body;
  const todo = todos.find(t => t.id === id);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  if (typeof completed === 'boolean') {
    todo.completed = completed;
  }
  res.json(todo);
});

// DELETE /api/todos/:id - Delete a todo
app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  todos.splice(index, 1);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`TODO API server running on http://localhost:${PORT}`);
});
