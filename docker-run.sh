#!/bin/bash

set -e

echo "🐳 DEX Docker Environment Manager"
echo "=================================="

case "$1" in
    "start")
        echo "🚀 Starting Hardhat node..."
        docker-compose up -d hardhat-node
        echo "⏳ Waiting for node to be ready..."
        sleep 10
        echo "✅ Hardhat node running on http://localhost:8545"
        ;;

    "deploy")
        echo "📦 Deploying contracts..."
        docker-compose --profile deploy up dex-deployer
        echo "✅ Deployment complete"
        ;;

    "demo")
        echo "🎭 Running trading demo..."
        docker-compose --profile demo up dex-demo
        echo "✅ Demo complete"
        ;;

    "services")
        echo "🔧 Starting price generator and keeper..."
        docker-compose --profile services up -d price-generator keeper
        echo "✅ Services running in background"
        ;;

    "full")
        echo "🌟 Full DEX deployment and services..."
        echo "1. Starting Hardhat node..."
        docker-compose up -d hardhat-node

        echo "2. Waiting for node..."
        sleep 15

        echo "3. Deploying contracts..."
        docker-compose --profile deploy up dex-deployer

        echo "4. Running demo..."
        docker-compose --profile demo up dex-demo

        echo "5. Starting services..."
        docker-compose --profile services up -d price-generator keeper

        echo "✅ Full DEX environment ready!"
        ;;

    "stop")
        echo "🛑 Stopping all services..."
        docker-compose down
        echo "✅ All services stopped"
        ;;

    "clean")
        echo "🧹 Cleaning up Docker environment..."
        docker-compose down -v
        docker system prune -f
        echo "✅ Environment cleaned"
        ;;

    "logs")
        service=${2:-hardhat-node}
        echo "📋 Showing logs for $service..."
        docker-compose logs -f $service
        ;;

    "shell")
        service=${2:-hardhat-node}
        echo "🐚 Opening shell in $service..."
        docker-compose exec $service sh
        ;;

    "status")
        echo "📊 Service status:"
        docker-compose ps
        ;;

    *)
        echo "Usage: $0 {start|deploy|demo|services|full|stop|clean|logs|shell|status}"
        echo ""
        echo "Commands:"
        echo "  start     - Start only Hardhat node"
        echo "  deploy    - Deploy contracts"
        echo "  demo      - Run trading demo"
        echo "  services  - Start price generator and keeper"
        echo "  full      - Complete deployment and services"
        echo "  stop      - Stop all services"
        echo "  clean     - Clean Docker environment"
        echo "  logs      - Show service logs (optional: service name)"
        echo "  shell     - Open shell in service (optional: service name)"
        echo "  status    - Show service status"
        exit 1
        ;;
esac