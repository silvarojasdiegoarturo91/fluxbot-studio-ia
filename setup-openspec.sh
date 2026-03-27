#!/bin/bash
# setup-openspec.sh - Initialize and setup OpenSpec for the project

set -e

echo "🔧 Setting up OpenSpec for Fluxbot Studio IA..."
echo ""

# Create reports directory if it doesn't exist
mkdir -p reports
echo "✅ Reports directory created"

# Generate initial status
echo ""
echo "📊 Generating requirement status report..."
npm run openspec:status

# Generate HTML report
echo ""
echo "📄 Generating HTML requirement report..."
npm run openspec:report:html
echo "✅ HTML report: reports/openspec-report.html"

# Generate Markdown report
echo ""
echo "📝 Generating Markdown requirement report..."
npm run openspec:report:md
echo "✅ Markdown report: reports/openspec-report.md"

# Validate requirements
echo ""
echo "✓ Validating requirement structure..."
npm run openspec:validate
echo "✅ All requirements validated"

# Show phase overview
echo ""
echo "🚀 Project Phases:"
npm run openspec:phases

# Show risk assessment
echo ""
echo "⚠️  Risk Assessment:"
npm run openspec:risks

# Show metrics
echo ""
echo "📈 Metrics & KPIs:"
npm run openspec:metrics

echo ""
echo "✨ OpenSpec setup complete!"
echo ""
echo "Available commands:"
echo "  npm run openspec:status      - Current requirement status"
echo "  npm run openspec:report:html - Generate HTML report"
echo "  npm run openspec:report:md   - Generate Markdown report"
echo "  npm run openspec:validate    - Validate requirements"
echo "  npm run openspec:phases      - Show project phases"
echo "  npm run openspec:trace       - Show dependencies"
echo "  npm run openspec:risks       - Show risks"
echo "  npm run openspec:watch       - Watch for changes"
echo ""
