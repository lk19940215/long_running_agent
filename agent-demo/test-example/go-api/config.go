package api

import "os"

type Config struct {
	Port     string
	Host     string
	LogLevel string
}

func NewConfig() *Config {
	return &Config{
		Port:     getEnv("PORT", "8080"),
		Host:     getEnv("HOST", "0.0.0.0"),
		LogLevel: getEnv("LOG_LEVEL", "info"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
