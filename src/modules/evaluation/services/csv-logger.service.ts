import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as csvWriter from 'csv-writer';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { EvaluationResultDto } from '../dto/evaluation-result.dto';
import { CauseDto } from '../dto/evaluate-projects-request.dto';

export interface CsvRowData {
  causeId: number;
  causeTitle: string;
  projectId: string;
  projectTitle: string;
  causeScore: number;
  projectInfoQualityScore: number;
  updateRecencyScore: number;
  socialMediaQualityScore: number;
  socialMediaRecencyScore: number;
  socialMediaFrequencyScore: number;
  relevanceToCauseScore: number;
  evidenceOfImpactScore: number;
  givPowerRankScore: number;
  evaluationTimestamp: string;
}

@Injectable()
export class CsvLoggerService {
  private readonly logger = new Logger(CsvLoggerService.name);
  private readonly csvFilePath: string;

  constructor(private readonly configService: ConfigService) {
    this.csvFilePath = this.configService.get<string>(
      'CSV_EVALUATION_LOG_PATH',
      './data/evaluation-results.csv',
    );
  }

  readEvaluationResults(causeIds?: number[]): CsvRowData[] {
    const allData = this.readExistingCsvData();

    if (!causeIds || causeIds.length === 0) {
      this.logger.log(
        `Reading evaluation results: returning all ${allData.length} records`,
      );
      return allData;
    }

    const filteredData = allData.filter(row => causeIds.includes(row.causeId));

    this.logger.log(
      `Reading evaluation results: ${filteredData.length} of ${allData.length} records match causeIds [${causeIds.join(', ')}]`,
    );

    return filteredData;
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

      const records: Array<Record<string, string>> = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      return records.map(record => this.mapRecordToData(record));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to read existing CSV data: ${errorMessage}. Starting with empty data.`,
      );
      return [];
    }
  }

  private mapRecordToData(record: Record<string, string>): CsvRowData {
    return {
      causeId: parseInt(record.causeId || '0') || 0,
      causeTitle: record.causeTitle || '',
      projectId: record.projectId || '',
      projectTitle: record.projectTitle || '',
      causeScore: parseFloat(record.causeScore || '0') || 0,
      projectInfoQualityScore:
        parseFloat(record.projectInfoQualityScore || '0') || 0,
      updateRecencyScore: parseFloat(record.updateRecencyScore || '0') || 0,
      socialMediaQualityScore:
        parseFloat(record.socialMediaQualityScore || '0') || 0,
      socialMediaRecencyScore:
        parseFloat(record.socialMediaRecencyScore || '0') || 0,
      socialMediaFrequencyScore:
        parseFloat(record.socialMediaFrequencyScore || '0') || 0,
      relevanceToCauseScore:
        parseFloat(record.relevanceToCauseScore || '0') || 0,
      evidenceOfImpactScore:
        parseFloat(record.evidenceOfImpactScore || '0') || 0,
      givPowerRankScore: parseFloat(record.givPowerRankScore || '0') || 0,
      evaluationTimestamp: record.evaluationTimestamp || '',
    };
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
      projectTitle: project.projectTitle,
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
        { id: 'projectTitle', title: 'projectTitle' },
        { id: 'causeScore', title: 'causeScore' },
        { id: 'projectInfoQualityScore', title: 'projectInfoQualityScore' },
        { id: 'updateRecencyScore', title: 'updateRecencyScore' },
        { id: 'socialMediaQualityScore', title: 'socialMediaQualityScore' },
        { id: 'socialMediaRecencyScore', title: 'socialMediaRecencyScore' },
        { id: 'socialMediaFrequencyScore', title: 'socialMediaFrequencyScore' },
        { id: 'relevanceToCauseScore', title: 'relevanceToCauseScore' },
        { id: 'evidenceOfImpactScore', title: 'evidenceOfImpactScore' },
        { id: 'givPowerRankScore', title: 'givPowerRankScore' },
        { id: 'evaluationTimestamp', title: 'evaluationTimestamp' },
      ],
    });

    await writer.writeRecords(data);
  }
}
