package api

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type UserRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

func NewResponse(code int, message string, data interface{}) *Response {
	return &Response{Code: code, Message: message, Data: data}
}

func HandleHealth(w http.ResponseWriter, r *http.Request) {
	resp := NewResponse(200, "ok", nil)
	json.NewEncoder(w).Encode(resp)
}

func HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req UserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "Invalid request body")
		return
	}

	if req.Name == "" || req.Email == "" {
		writeError(w, 400, "Name and email are required")
		return
	}

	resp := NewResponse(201, "User created", req)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func writeError(w http.ResponseWriter, code int, message string) {
	resp := NewResponse(code, message, nil)
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(resp)
	fmt.Println("Error:", message)
}
