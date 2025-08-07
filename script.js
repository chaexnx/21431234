class NewsStatisticsAnalyzer {
    constructor() {
        this.newsInput = document.getElementById('newsInput');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.resultsSection = document.getElementById('resultsSection');
        this.statisticsList = document.getElementById('statisticsList');
        this.errorAnalysis = document.getElementById('errorAnalysis');
        this.simpsonAnalysis = document.getElementById('simpsonAnalysis');
        this.chartContainer = document.getElementById('chartContainer');

        // Gemini API 설정
        this.geminiApiKey = 'AIzaSyAnxmSLPc3N_om5AwjwIeW52SdBvMhHpgs';
        this.geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

        this.init();
    }

    init() {
        this.analyzeBtn.addEventListener('click', () => this.analyzeNews());

        // Enter 키로도 분석 시작
        this.newsInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.analyzeNews();
            }
        });
    }

    async analyzeNews() {
        const text = this.newsInput.value.trim();

        if (!text) {
            alert('뉴스 기사를 입력해주세요.');
            return;
        }

        this.showLoading();

        try {
            // Gemini API를 사용한 실제 분석
            const analysisResult = await this.analyzeWithGemini(text);
            this.displayResults(analysisResult.statistics, analysisResult.errors, analysisResult.simpsonRisks);
        } catch (error) {
            console.error('분석 중 오류가 발생했습니다:', error);
            alert('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            this.resetAnalyzeButton();
        }
    }

    showLoading() {
        this.analyzeBtn.innerHTML = '<div class="loading">AI 분석 중...</div>';
        this.analyzeBtn.disabled = true;
    }

    resetAnalyzeButton() {
        this.analyzeBtn.innerHTML = '분석 시작';
        this.analyzeBtn.disabled = false;
    }

    async analyzeWithGemini(text) {
        const prompt = `
다음 뉴스 기사를 분석해주세요. 반드시 JSON 형태로만 응답하고, 다른 설명은 포함하지 마세요.

분석할 텍스트:
${text}

다음 형태의 JSON으로 응답해주세요:
{
  "statistics": [
    {
      "sentence": "통계가 포함된 문장",
      "numbers": [숫자배열],
      "type": "percentage|increase|decrease|comparison|average|general"
    }
  ],
  "errors": [
    {
      "type": "오류 유형",
      "description": "오류 설명",
      "sentence": "해당 문장",
      "severity": "low|medium|high"
    }
  ],
  "simpsonRisks": [
    {
      "type": "심슨의 역설 위험 유형",
      "description": "위험 설명",
      "sentence": "해당 문장",
      "probability": "low|medium|high"
    }
  ]
}

분석 기준:
1. 통계 문장: 숫자, 퍼센트, 증감률이 포함된 문장을 추출
2. 통계 오류 체크:
   - 표본 크기 미명시
   - 상관관계를 인과관계로 오해 가능성
   - 비현실적 수치 (100% 초과 등)
   - 모호한 기준점 ("작년", "과거" 등 구체적 기간 없음)
3. 심슨의 역설 가능성:
   - 집계 데이터 (전체, 평균, 총합 등)
   - 전체-부분 비교 (지역별, 그룹별 등)
   - 시간 집계 (연간, 월간 등)
`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                topK: 1,
                topP: 1,
                maxOutputTokens: 2048,
            }
        };

        const response = await fetch(`${this.geminiApiUrl}?key=${this.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status}`);
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('API 응답이 올바르지 않습니다');
        }

        const geminiResponse = data.candidates[0].content.parts[0].text;

        try {
            // JSON 파싱을 위해 코드 블록이나 여분의 텍스트 제거
            const cleanJson = geminiResponse.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (parseError) {
            console.error('JSON 파싱 오류:', parseError);
            console.error('Gemini 응답:', geminiResponse);

            // 파싱 실패 시 기본 구조 반환
            return {
                statistics: [{
                    sentence: "AI 분석 중 오류가 발생했지만 통계 문장이 감지되었습니다.",
                    numbers: [],
                    type: "general"
                }],
                errors: [{
                    type: "분석 오류",
                    description: "AI 분석 중 일시적 오류가 발생했습니다. 다시 시도해주세요.",
                    sentence: "시스템 메시지",
                    severity: "medium"
                }],
                simpsonRisks: []
            };
        }
    }

    extractStatistics(text) {
        // 통계 관련 패턴 정의
        const patterns = [
            /(\d+(?:\.\d+)?%)/g,
            /(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:명|개|건|회|번|시간|일|년|월)/g,
            /(?:증가|감소|상승|하락|늘어|줄어)\s*(\d+(?:\.\d+)?%?)/g,
            /(\d+(?:\.\d+)?)\s*(?:배|倍)/g,
            /(?:평균|중간값|최대|최소|총합)\s*(\d+(?:,\d+)*(?:\.\d+)?)/g,
            /(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/g
        ];

        const statistics = [];
        let sentences = text.split(/[.!?]+/);

        sentences.forEach(sentence => {
            sentence = sentence.trim();
            if (sentence.length < 10) return;

            let hasStatistic = false;
            patterns.forEach(pattern => {
                if (pattern.test(sentence)) {
                    hasStatistic = true;
                }
            });

            if (hasStatistic) {
                statistics.push({
                    sentence: sentence,
                    numbers: this.extractNumbers(sentence),
                    type: this.classifyStatistic(sentence)
                });
            }
        });

        return statistics;
    }

    displayResults(statistics, errors, simpsonRisks) {
        // 분석 버튼 복원
        this.resetAnalyzeButton();

        // 결과 섹션 표시
        this.resultsSection.style.display = 'block';

        // 통계 문장 표시
        this.displayStatistics(statistics);

        // 오류 분석 표시
        this.displayErrorAnalysis(errors);

        // 심슨의 역설 분석 표시
        this.displaySimpsonAnalysis(simpsonRisks);

        // 시각화 생성
        this.createVisualization(statistics, errors, simpsonRisks);

        // 결과로 스크롤
        this.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    displayStatistics(statistics) {
        if (statistics.length === 0) {
            this.statisticsList.innerHTML = '<p>통계 문장이 발견되지 않았습니다.</p>';
            return;
        }

        this.statisticsList.innerHTML = statistics.map(stat => `
            <div class="statistic-item">
                "${stat.sentence}"
                <div style="margin-top: 0.5rem; font-size: 0.9rem; color: #666;">
                    타입: ${this.getTypeLabel(stat.type)} | 숫자: ${stat.numbers.join(', ')}
                </div>
            </div>
        `).join('');
    }

    displayErrorAnalysis(errors) {
        if (errors.length === 0) {
            this.errorAnalysis.innerHTML = '<p>❤️ 특별한 통계 오류가 발견되지 않았습니다!</p>';
            return;
        }

        const groupedErrors = this.groupBy(errors, 'type');
        this.errorAnalysis.innerHTML = Object.keys(groupedErrors).map(type => `
            <div style="margin-bottom: 1rem;">
                <h4>${type} <span class="risk-level risk-${groupedErrors[type][0].severity}">${this.getSeverityLabel(groupedErrors[type][0].severity)}</span></h4>
                <p>${groupedErrors[type][0].description}</p>
                <small>발견된 문장 ${groupedErrors[type].length}개</small>
            </div>
        `).join('');
    }

    displaySimpsonAnalysis(risks) {
        if (risks.length === 0) {
            this.simpsonAnalysis.innerHTML = '<p>✅ 심슨의 역설 위험이 낮습니다.</p>';
            return;
        }

        const groupedRisks = this.groupBy(risks, 'type');
        this.simpsonAnalysis.innerHTML = Object.keys(groupedRisks).map(type => `
            <div style="margin-bottom: 1rem;">
                <h4>${type} <span class="risk-level risk-${groupedRisks[type][0].probability}">${this.getProbabilityLabel(groupedRisks[type][0].probability)}</span></h4>
                <p>${groupedRisks[type][0].description}</p>
                <small>해당 문장 ${groupedRisks[type].length}개</small>
            </div>
        `).join('');
    }

    createVisualization(statistics, errors, simpsonRisks) {
        const data = {
            statistics: statistics.length,
            errors: errors.length,
            simpsonRisks: simpsonRisks.length
        };

        this.chartContainer.innerHTML = `
            <div style="width: 100%; text-align: center;">
                <h4 style="margin-bottom: 1rem;">분석 요약</h4>
                <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 1rem;">
                    <div style="text-align: center; padding: 1rem; background: #e6fffa; border-radius: 8px; min-width: 120px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #0c4a6e;">${data.statistics}</div>
                        <div style="color: #0c4a6e;">통계 문장</div>
                    </div>
                    <div style="text-align: center; padding: 1rem; background: #fef3c7; border-radius: 8px; min-width: 120px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #92400e;">${data.errors}</div>
                        <div style="color: #92400e;">오류 위험</div>
                    </div>
                    <div style="text-align: center; padding: 1rem; background: #fee2e2; border-radius: 8px; min-width: 120px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #991b1b;">${data.simpsonRisks}</div>
                        <div style="color: #991b1b;">심슨의 역설</div>
                    </div>
                </div>
                ${this.getRecommendation(data)}
            </div>
        `;
    }

    getRecommendation(data) {
        let recommendation = '<div style="margin-top: 2rem; padding: 1rem; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">';
        recommendation += '<h4 style="color: #0c4a6e; margin-bottom: 0.5rem;">🤖 AI 분석 결과 및 권장사항</h4>';

        if (data.errors === 0 && data.simpsonRisks === 0) {
            recommendation += '<p style="color: #0c4a6e;">Gemini AI 분석 결과, 이 기사의 통계는 비교적 신뢰할 수 있어 보입니다! 하지만 항상 비판적 사고를 유지하세요.</p>';
        } else if (data.errors > 0 && data.simpsonRisks > 0) {
            recommendation += '<p style="color: #0c4a6e;">AI가 통계 오류와 심슨의 역설 위험을 모두 감지했습니다. 원본 데이터와 연구 방법론을 반드시 확인해보세요.</p>';
        } else if (data.errors > 0) {
            recommendation += '<p style="color: #0c4a6e;">AI가 통계 해석에 주의가 필요한 부분을 발견했습니다. 데이터의 출처와 수집 방법을 확인해보세요.</p>';
        } else {
            recommendation += '<p style="color: #0c4a6e;">AI가 심슨의 역설 가능성을 감지했습니다. 세부 그룹별 데이터도 함께 살펴보세요.</p>';
        }

        recommendation += '<p style="color: #64748b; font-size: 0.9rem; margin-top: 0.5rem;">* 이 분석은 Gemini 1.5 Flash AI 모델을 통해 수행되었습니다.</p>';
        recommendation += '</div>';
        return recommendation;
    }

    groupBy(array, key) {
        return array.reduce((result, currentValue) => {
            (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
            return result;
        }, {});
    }

    getTypeLabel(type) {
        const labels = {
            'increase': '증가',
            'decrease': '감소',
            'comparison': '비교',
            'percentage': '비율',
            'average': '평균',
            'general': '일반'
        };
        return labels[type] || type;
    }

    getSeverityLabel(severity) {
        const labels = {
            'low': '낮음',
            'medium': '보통',
            'high': '높음'
        };
        return labels[severity] || severity;
    }

    getProbabilityLabel(probability) {
        const labels = {
            'low': '낮음',
            'medium': '보통',
            'high': '높음'
        };
        return labels[probability] || probability;
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new NewsStatisticsAnalyzer();
});

// 예시 뉴스 데이터 (테스트용)
function loadExampleNews() {
    const exampleText = `
    작년 한국의 스마트폰 보급률이 95%에 달했다고 발표되었습니다. 
    이는 전년 대비 5% 증가한 수치로, 전 세계 평균인 78%를 크게 웃도는 결과입니다.
    특히 20대의 경우 보급률이 99.2%에 이르렀으며, 60대 이상에서도 85%의 높은 보급률을 보였습니다.
    전문가들은 이러한 높은 보급률이 디지털 격차 해소에 기여했다고 분석했습니다.
    또한 온라인 쇼핑 이용률도 전년 대비 25% 증가하여 스마트폰 보급률 증가와 상관관계를 보인다고 말했습니다.
    `;

    document.getElementById('newsInput').value = exampleText;
}

// 개발자를 위한 예시 로드 함수 (콘솔에서 실행 가능)
window.loadExampleNews = loadExampleNews;