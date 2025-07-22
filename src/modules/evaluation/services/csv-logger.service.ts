import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as csvWriter from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';
import { EvaluationResultDto } from '../dto/evaluation-result.dto';
import { CauseDto } from '../dto/evaluate-projects-request.dto';

interface CsvRowData {
  causeId: number;
  causeTitle: string;
  projectId: string;
  causeScore: number;
  projectInfoQualityScore: number;
  updateRecencyScore: number;
  socialMediaQualityScore: number;
  socialMediaRecencyScore: number;
  socialMediaFrequencyScore: number;
  relevanceToCauseScore: number;
  evidenceOfImpactScore: number;
  givPowerRankScore: number;
  hasStoredPosts: boolean;
  totalStoredPosts: number;
  lastPostDate: string;
  evaluationTimestamp: string;
}

@Injectable()
export class CsvLoggerService {
  private readonly logger = new Logger(CsvLoggerService.name);
  private readonly csvFilePath: string;

  constructor(private readonly configService: ConfigService) {
    this.csvFilePath = this.configService.get<string>(
      'CSV_EVALUATION_LOG_PATH',
      './evaluation-results.csv',
    );
  }

  async logEvaluationResult(
    cause: CauseDto,
    evaluationResult: EvaluationResultDto,
  ): Promise<void> {
    try {
      const existingData = this.readExistingCsvData();
      const filteredData = this.removeExistingCauseData(existingData, cause.id);
      const newRows = this.convertEvaluationToRows(cause, evaluationResult);
      const allData = [...filteredData, ...newRows];

      await this.writeCsvData(allData);
      this.logger.log(
        `CSV log updated for cause ${cause.id} with ${newRows.length} projects`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to log evaluation result for cause ${cause.id}: ${errorMessage}`,
        errorStack,
      );
    }
  }

  private readExistingCsvData(): CsvRowData[] {
    if (!fs.existsSync(this.csvFilePath)) {
      return [];
    }

    try {
      const csvContent = fs.readFileSync(this.csvFilePath, 'utf-8');
      if (!csvContent.trim()) {
        return [];
      }

      const lines = csvContent.trim().split('\n');
      if (lines.length <= 1) {
        return [];
      }

      const headers = lines[0].split(',');
      const rows = lines.slice(1);

      return rows.map(row => {
        const values = this.parseCsvRow(row);
        return this.mapRowToData(headers, values);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to read existing CSV data: ${errorMessage}. Starting with empty data.`,
      );
      return [];
    }
  }

  private parseCsvRow(row: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private mapRowToData(headers: string[], values: string[]): CsvRowData {
    const data: Partial<CsvRowData> = {};
    headers.forEach((header, index) => {
      const cleanHeader = header.replace(/"/g, '').trim();
      const value = values[index]?.replace(/"/g, '').trim() ?? '';

      switch (cleanHeader) {
        case 'causeId':
          (data as any).causeId = parseInt(value) || 0;
          break;
        case 'causeScore':
          (data as any).causeScore = parseInt(value) || 0;
          break;
        case 'projectInfoQualityScore':
          (data as any).projectInfoQualityScore = parseInt(value) || 0;
          break;
        case 'updateRecencyScore':
          (data as any).updateRecencyScore = parseInt(value) || 0;
          break;
        case 'socialMediaQualityScore':
          (data as any).socialMediaQualityScore = parseInt(value) || 0;
          break;
        case 'socialMediaRecencyScore':
          (data as any).socialMediaRecencyScore = parseInt(value) || 0;
          break;
        case 'socialMediaFrequencyScore':
          (data as any).socialMediaFrequencyScore = parseInt(value) || 0;
          break;
        case 'relevanceToCauseScore':
          (data as any).relevanceToCauseScore = parseInt(value) || 0;
          break;
        case 'evidenceOfImpactScore':
          (data as any).evidenceOfImpactScore = parseInt(value) || 0;
          break;
        case 'givPowerRankScore':
          (data as any).givPowerRankScore = parseInt(value) || 0;
          break;
        case 'totalStoredPosts':
          (data as any).totalStoredPosts = parseInt(value) || 0;
          break;
        case 'hasStoredPosts':
          (data as any).hasStoredPosts = value.toLowerCase() === 'true';
          break;
        case 'causeTitle':
          (data as any).causeTitle = value;
          break;
        case 'projectId':
          (data as any).projectId = value;
          break;
        case 'lastPostDate':
          (data as any).lastPostDate = value;
          break;
        case 'evaluationTimestamp':
          (data as any).evaluationTimestamp = value;
          break;
      }
    });
    return data as CsvRowData;
  }

  private removeExistingCauseData(
    existingData: CsvRowData[],
    causeId: number,
  ): CsvRowData[] {
    return existingData.filter(row => row.causeId !== causeId);
  }

  private convertEvaluationToRows(
    cause: CauseDto,
    evaluationResult: EvaluationResultDto,
  ): CsvRowData[] {
    return evaluationResult.data.map(project => ({
      causeId: cause.id,
      causeTitle: cause.title,
      projectId: project.projectId,
      causeScore: project.causeScore,
      projectInfoQualityScore:
        project.scoreBreakdown?.projectInfoQualityScore ?? 0,
      updateRecencyScore: project.scoreBreakdown?.updateRecencyScore ?? 0,
      socialMediaQualityScore:
        project.scoreBreakdown?.socialMediaQualityScore ?? 0,
      socialMediaRecencyScore:
        project.scoreBreakdown?.socialMediaRecencyScore ?? 0,
      socialMediaFrequencyScore:
        project.scoreBreakdown?.socialMediaFrequencyScore ?? 0,
      relevanceToCauseScore: project.scoreBreakdown?.relevanceToCauseScore ?? 0,
      evidenceOfImpactScore: project.scoreBreakdown?.evidenceOfImpactScore ?? 0,
      givPowerRankScore: project.scoreBreakdown?.givPowerRankScore ?? 0,
      hasStoredPosts: project.hasStoredPosts ?? false,
      totalStoredPosts: project.totalStoredPosts ?? 0,
      lastPostDate: project.lastPostDate
        ? project.lastPostDate.toISOString()
        : '',
      evaluationTimestamp: project.evaluationTimestamp.toISOString(),
    }));
  }

  private async writeCsvData(data: CsvRowData[]): Promise<void> {
    const csvFilePath = path.resolve(this.csvFilePath);
    const csvDir = path.dirname(csvFilePath);

    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }

    const writer = csvWriter.createObjectCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'causeId', title: 'causeId' },
        { id: 'causeTitle', title: 'causeTitle' },
        { id: 'projectId', title: 'projectId' },
        { id: 'causeScore', title: 'causeScore' },
        { id: 'projectInfoQualityScore', title: 'projectInfoQualityScore' },
        { id: 'updateRecencyScore', title: 'updateRecencyScore' },
        { id: 'socialMediaQualityScore', title: 'socialMediaQualityScore' },
        { id: 'socialMediaRecencyScore', title: 'socialMediaRecencyScore' },
        { id: 'socialMediaFrequencyScore', title: 'socialMediaFrequencyScore' },
        { id: 'relevanceToCauseScore', title: 'relevanceToCauseScore' },
        { id: 'evidenceOfImpactScore', title: 'evidenceOfImpactScore' },
        { id: 'givPowerRankScore', title: 'givPowerRankScore' },
        { id: 'hasStoredPosts', title: 'hasStoredPosts' },
        { id: 'totalStoredPosts', title: 'totalStoredPosts' },
        { id: 'lastPostDate', title: 'lastPostDate' },
        { id: 'evaluationTimestamp', title: 'evaluationTimestamp' },
      ],
    });

    await writer.writeRecords(data);
  }
}
